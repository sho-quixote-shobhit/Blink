const AllSong = require('./models/allsearch')
const WatchedSong = require('./models/watched')
const TowatchSong = require('./models/towatch')
const User = require('./models/user');
const Artist = require('./models/artist')
const mongoose = require('mongoose')


module.exports.isLoggedIn = (req,res,next)=>{
    if(!req.isAuthenticated()){
        req.flash('error' , 'You must be loggedin')
        return res.redirect('/login')
    }
    next();
}


module.exports.alreadyWatched = async (req,res,next)=>{
    const {id} = req.params;
    const current_song = await AllSong.findById(id);
    const artist_name = current_song.artist_name
    const user = await User.findById(req.user._id).populate('watched');
    const already_watched_songs = user.watched;
    let i = 0;
    for(i=0 ;i<already_watched_songs.length; i++){
        if(already_watched_songs[i].videoId == current_song.videoId){
            
            req.flash('error' , 'You have already watched this video');
            return res.redirect(`/artists/${artist_name}/${id}`) 
        }
    }
    next();
}

module.exports.intoWatchList = async(req,res,next)=>{
    const {id} = req.params;
    const current_song = await AllSong.findById(id);
    const artist_name = current_song.artist_name
    const user = await User.findById(req.user._id).populate('towatch');
    const to_watch_songlist = user.towatch;
    let i = 0;
    for(i=0 ;i<to_watch_songlist.length; i++){
        if(to_watch_songlist[i].videoId == current_song.videoId){
            req.flash('error' , 'Already in towatch list');
            return res.redirect(`/artists/${artist_name}/${id}`) 
        }
    }
    next();
}