const express = require('express');
const app = express();
const path = require('path')
const ejs = require('ejs')
const bodyParser = require('body-parser')
const https = require('https')
const ejsMate = require('ejs-mate')
const mongoose = require('mongoose')
const session = require('express-session')
const passport = require('passport');
const LocalStrategy = require('passport-local')
const flash = require('connect-flash')
const cookieParser = require('cookie-parser');
const SerpApi = require('google-search-results-nodejs');

const dotenv = require('dotenv')
dotenv.config();

const search = new SerpApi.GoogleSearch(process.env.serpApiKey);
const PORT = process.env.port || 3000

const WatchedSong = require('./models/watched')
const TowatchSong = require('./models/towatch')
const AllSong = require('./models/allsearch')
const Artist = require('./models/artist')
const User = require('./models/user')

const expressError = require('./utils/ExpressErrors')
const catchasync = require('./utils/catchasync')

const { isLoggedIn, alreadyWatched, intoWatchList } = require('./middleware');



app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')));


app.engine('ejs', ejsMate);
app.set("view engine", "ejs");
app.set('views', path.join(__dirname, 'views'))


mongoose.set('strictQuery', false);
mongoose.connect(process.env.dbURL, {
    useNewUrlParser: true,
}).then(() => {
    console.log('success')
}).catch((err) => {
    console.log(err);
})
mongoose.connection.on('error', console.error.bind(console, "connection error"));
mongoose.connection.once("open", () => {
    console.log("Database connected");
})


const sessionConfig = {
    secret: process.env.secret,
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        expires: Date.now() + (1000 * 60 * 60 * 24 * 7),
        maxAge: (1000 * 60 * 60 * 24 * 7)
    }
}
app.use(cookieParser());
app.use(session(sessionConfig))
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(flash())    
app.use((req, res, next) => {
    res.locals.currentuser = req.user;
    res.locals.success = req.flash('success')
    res.locals.error = req.flash('error')
    next();
})

app.get('/signup', (req, res) => {
    res.render('users/signup');
})

app.post('/signup', catchasync(async (req, res) => {
    try {
        const { email, username, password } = req.body;
        const user = new User({ email, username });
        const registered_user = await User.register(user, password);

        req.logIn(registered_user, (err) => {
            if (err)
                return next(err);

            req.flash('success', 'welcome to Blink')
            res.redirect('/')
        })

    } catch (e) {
        req.flash('error', e.message);
        res.redirect('/signup')
    }
}))

app.get('/login', (req, res) => {
    res.render('users/login');
})

app.post('/login', passport.authenticate('local', { failureFlash: true, failureRedirect: '/login' }), async (req, res) => {
    req.flash('success', 'welcome back');
    res.redirect('/')
})

app.get('/', async (req, res) => {
    res.render('artists/search')
})

app.post('/logout', catchasync( async function(req, res, next){
    req.logout(function(err) {
      if (err) { return next(err); }
      res.redirect('/');
    });
}));

app.post('/', isLoggedIn, catchasync(async (req, res) => {
    const user = await User.findById(req.user._id).populate('allsongs');
    const allsongs = user.allsongs;
    if (allsongs.length) {
        allsongs.forEach(async (song) => {
            await AllSong.findByIdAndDelete(song._id)
        })
    }
    await User.findByIdAndUpdate(req.user._id, { $set: { "allsongs": [] } }, { multi: true })
    const params = {
        engine: "google_autocomplete",
        q: req.body.artist
    };
    const callback = async function (data) {
        const autocorrect = data['suggestions']
        const autocorrect_value = autocorrect[0];
        const autocorrected_artist_name = autocorrect_value.value;

        if (autocorrected_artist_name.includes(req.body.artist)) {

            const user = await User.findByIdAndUpdate(req.user._id, {
                artist_name: req.body.artist.toUpperCase()
            });
            
            https.get(`https://youtube.googleapis.com/youtube/v3/search?key=${process.env.googleApiKey}&part=snippet&q=${req.body.artist}&maxResults=20&type =music video&order=viewCount`, (response) => {
                let artist_data = '';
                response.on('data', (data) => {
                    artist_data += data
                })
                response.on('end', catchasync(async () => {
                    const search_data = JSON.parse(artist_data)
                    const items = search_data['items']
                    
                    items.forEach(catchasync(async (Eachsong) => {
                        const user = await User.findById(req.user._id);
                        let title = Eachsong.snippet.title;
                        const sequences = { "&#39;": "'", "&amp;": "&", "&quot;": '"' }
                        title = title.replace(/&#39;|&amp;|&quot;/gi, function (matched) {
                            return sequences[matched];
                        });

                        const song = new AllSong({
                            videoId: Eachsong.id.videoId,
                            channelId: Eachsong.snippet.channelId,
                            title: title,
                            image: Eachsong.snippet.thumbnails.high.url,
                            time: Eachsong.snippet.publishTime,
                            channelTitle: Eachsong.snippet.channelTitle,
                            artist_name: user.artist_name
                        })
                        await song.save();
                        user.allsongs.push(song);
                        await user.save();
                    }))
                    await user.save();
                    setTimeout(() => {
                        res.redirect(`/artists/${req.body.artist.toUpperCase()}`)
                    }, 100);
                }));
            })
        } else {
            const user = await User.findByIdAndUpdate(req.user._id, {
                artist_name: autocorrected_artist_name.toUpperCase()
            });
            await user.save();
            https.get(`https://youtube.googleapis.com/youtube/v3/search?key=${process.env.googleApiKey}&part=snippet&q=${autocorrected_artist_name}&maxResults=20&type=musicvideo&order=viewCount`, (response) => {
                let artist_data = '';
                response.on('data', (data) => {
                    artist_data += data
                })
                response.on('end', catchasync(async () => {
                    const search_data = JSON.parse(artist_data)
                    const items = search_data['items']
                    
                    items.forEach(catchasync(async (Eachsong) => {
                        const user = await User.findById(req.user._id);
                        let title = Eachsong.snippet.title;
                        const sequences = { "&#39;": "'", "&amp;": "&", "&quot;": '"' }
                        title = title.replace(/&#39;|&amp;|&quot;/gi, function (matched) {
                            return sequences[matched];
                        });
                        const song = new AllSong({
                            videoId: Eachsong.id.videoId,
                            channelId: Eachsong.snippet.channelId,
                            title: title,
                            image: Eachsong.snippet.thumbnails.high.url,
                            time: Eachsong.snippet.publishTime,
                            channelTitle: Eachsong.snippet.channelTitle,
                            artist_name: user.artist_name
                        })
                        await song.save();
                        user.allsongs.push(song);
                        await user.save();
                    }))
                    setTimeout(() => {
                        res.redirect(`/artists/${autocorrected_artist_name.toUpperCase()}`)
                    }, 100);
                }));
            })
        }

    };
    search.json(params, callback);

}))

app.post('/artists/research/:name' , catchasync(async(req,res)=>{
    const user = await User.findById(req.user._id).populate('allsongs');
    const allsongs = user.allsongs;
    if (allsongs.length) {
        allsongs.forEach(async (song) => {
            await AllSong.findByIdAndDelete(song._id)
        })
    }
    await User.findByIdAndUpdate(req.user._id, { $set: { "allsongs": [] } }, { multi: true })
    const {name} = req.params;
    await User.findByIdAndUpdate(req.user._id, {
        artist_name: name.toUpperCase()
    });
    await user.save();
    https.get(`https://youtube.googleapis.com/youtube/v3/search?key=${process.env.googleApiKey}&part=snippet&q=${name}&maxResults=20&type=musicvideo&order=viewCount`, (response) => {
        let artist_data = '';
        response.on('data', (data) => {
            artist_data += data
        })
        response.on('end', catchasync(async () => {
            const search_data = JSON.parse(artist_data)
            const items = search_data['items']
            
            items.forEach(catchasync(async (Eachsong) => {
                const user = await User.findById(req.user._id);
                let title = Eachsong.snippet.title;
                const sequences = { "&#39;": "'", "&amp;": "&", "&quot;": '"' }
                title = title.replace(/&#39;|&amp;|&quot;/gi, function (matched) {
                    return sequences[matched];
                });
                const song = new AllSong({
                    videoId: Eachsong.id.videoId,
                    channelId: Eachsong.snippet.channelId,
                    title: title,
                    image: Eachsong.snippet.thumbnails.high.url,
                    time: Eachsong.snippet.publishTime,
                    channelTitle: Eachsong.snippet.channelTitle,
                    artist_name: user.artist_name
                })
                await song.save();
                user.allsongs.push(song);
                await user.save();
            }))
            
            setTimeout(() => {
                res.redirect(`/artists/${name}`)
            }, 100);
        }));
    })
}))

app.get('/artists/:name', catchasync(async (req, res) => {
    const user = await User.findById(req.user._id).populate('allsongs');
    const songs = user.allsongs;
    const heading = user.artist_name
    res.render('artists/show_all_mv', { songs, heading });
}))

app.get('/artists/:name/:id', catchasync(async (req, res) => {
    const { id } = req.params;
    const song = await AllSong.findById(id);
    res.render('artists/show_each', { song });
}))

app.post('/artists/:name/watch/:videoId' , catchasync(async(req,res)=>{
    const {videoId} = req.params;
    res.render('artists/video' , {videoId}) 
}))

app.post('/artists/:name/:id/watched', isLoggedIn, alreadyWatched, catchasync(async (req, res) => {
    const { id } = req.params;
    const song = await AllSong.findById(id);
    const user = await User.findById(req.user._id).populate('watched').populate('towatch').populate('artists')
    const watched_song = new WatchedSong({
        videoId: song.videoId,
        channelId: song.channelId,
        title: song.title,
        image: song.image,
        channelTitle: song.channelTitle,
        artist_name: user.artist_name
    })
    await watched_song.save();

    const existing_artists = user.artists;
    if (existing_artists.length === 0) {
        const artist_name = user.artist_name
        const new_artist = new Artist({ artist_name , artist_image : song.image})
        new_artist.watched.push(watched_song);
        await new_artist.save();
        user.artists.push(new_artist);
        user.watched.push(watched_song)
        await user.save();
        
        req.flash('success', 'Successfully added in watched list')
        res.redirect(`/artists/${user.artist_name}/${id}`)
    }
    else {
        let i;
        for (i = 0; i < existing_artists.length; i++) {
            if (existing_artists[i].artist_name == user.artist_name) {
                const existing_artist = await Artist.findById(existing_artists[i]._id)
                existing_artist.watched.push(watched_song);
                user.watched.push(watched_song)
                await existing_artist.save();
                await user.save();
                req.flash('success', 'Successfully added in watched list')
                res.redirect(`/artists/${user.artist_name}/${id}`)
                break;
            }
        }
        if (i == existing_artists.length) {
            const artist_name = user.artist_name
            const new_artist = new Artist({ artist_name , artist_image : song.image })
            new_artist.watched.push(watched_song);
            await new_artist.save();
            await new_artist.populate('watched') 
            user.artists.push(new_artist);
            user.watched.push(watched_song)
            await user.save();
            req.flash('success', 'Successfully added in watched list')
            res.redirect(`/artists/${user.artist_name}/${id}`)
        }
    }
}))

app.post('/artists/:name/:id/towatch', isLoggedIn, alreadyWatched, intoWatchList, catchasync(async (req, res) => {
    const { id } = req.params;
    const song = await AllSong.findById(id);
    const user = await User.findById(req.user._id).populate('towatch').populate('watched').populate('artists')
    const to_watch_song = new TowatchSong({
        videoId: song.videoId,
        channelId: song.channelId,
        title: song.title,
        image: song.image,
        channelTitle: song.channelTitle,
        artist_name: user.artist_name
    })
    await to_watch_song.save();
    
    const existing_artists = user.artists;
    if (existing_artists.length == 0) {
        const {artist_name} = user
        const new_artist = new Artist({ artist_name , artist_image : song.image})
        new_artist.towatch.push(to_watch_song);
        await new_artist.save();
        user.artists.push(new_artist);
        user.towatch.push(to_watch_song)
        await user.save();
        req.flash('success', 'Successfully added in towatch list')
        res.redirect(`/artists/${artist_name}/${id}`)
    }
    else {
        let i;
        for (i = 0; i < existing_artists.length; i++) {
            if (existing_artists[i].artist_name == user.artist_name) {
                const existing_artist = await Artist.findById(existing_artists[i]._id)
                existing_artist.towatch.push(to_watch_song);
                user.towatch.push(to_watch_song)
                await existing_artist.save();
                await user.save();
                req.flash('success', 'Successfully added in towatch list')
                res.redirect(`/artists/${user.artist_name}/${id}`)
                break;
            }
        }
        if (i == existing_artists.length) {
            const {artist_name} = user
            const new_artist = new Artist({ artist_name , artist_image : song.image})
            new_artist.towatch.push(to_watch_song);
            await new_artist.save();
            user.artists.push(new_artist);
            user.towatch.push(to_watch_song);
            await user.save();
            req.flash('success', 'Successfully added in towatch list')
            res.redirect(`/artists/${artist_name}/${id}`)
        }
    }

}))

app.get('/profile', catchasync( async (req, res) => {
    const user = await User.findById(req.user._id).populate('artists')
    const {username , artists} = user
    res.render('users/profile' ,{username,artists})
}))

app.get('/profile/:id/watched' , catchasync(async(req,res)=>{
    const {id} = req.params
    const artist = await Artist.findById(id).populate('watched')
    const {artist_name , watched} = artist;
    res.render('users/watched' , {artist_name , watched})
}))
app.get('/profile/:id/towatch' , catchasync(async(req,res)=>{
    const {id} = req.params
    const artist = await Artist.findById(id).populate('towatch')
    const {artist_name , towatch} = artist;
    res.render('users/towatch' , {artist_name , towatch , id})
}))

app.post('/profile/:id/towatch/:songid/remove' , catchasync(async(req,res)=>{
    const {id , songid} = req.params;
    await Artist.findByIdAndUpdate(id , {$pull : {towatch : {$in : songid}}})
    await User.findByIdAndUpdate(req.user._id , {$pull : {towatch : {$in : songid}}})
    await TowatchSong.findByIdAndDelete(songid)
    res.redirect(`/profile/${id}/towatch`)
}))

app.post('/profile/:id/towatch/:songid/watched' , catchasync(async(req,res)=>{
    const {id , songid} = req.params;
    const towatch_song = await TowatchSong.findById(songid)
    const song = new WatchedSong({
        videoId: towatch_song.videoId,
        channelId: towatch_song.channelId,
        title: towatch_song.title,
        image: towatch_song.image,
        channelTitle: towatch_song.channelTitle,
        artist_name: towatch_song.artist_name
    })
    await song.save();
    const user = await User.findByIdAndUpdate(req.user._id , {$pull : {towatch : {$in : songid}}})
    const artist = await Artist.findByIdAndUpdate(id , {$pull : {towatch : {$in : songid}}})
    artist.watched.push(song);
    user.watched.push(song);
    await artist.save();
    await user.save();
    await TowatchSong.findByIdAndDelete(songid)
    req.flash('success' , 'Added to you watched list')
    res.redirect(`/profile/${id}/towatch`)
}))

app.post('/nah', (req, res) => {
    res.render('artists/nah')
})


app.all("*", (req, res, next) => {
    next(new expressError('page not found', 404))
})
app.use((err, req, res, next) => {
    const { statusCode = 500 } = err;
    if (!err.message) err.message = 'something went wrong'
    res.status(statusCode).render('error', { err });
})

app.listen(PORT, () => {
    console.log(`listning at port ${PORT}`);
})

