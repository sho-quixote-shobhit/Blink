const mongoose = require('mongoose')
const {Schema} = mongoose;
const WatchedSong = require('./watched')
const TowatchSong = require('./towatch')


const artistSchema = new Schema({ 
    artist_name: String,
    artist_image :String,
    watched: [
    {
        type: Schema.Types.ObjectId,
        ref: 'WatchedSong'
    }
    ],
    towatch: [
    {
        type: Schema.Types.ObjectId,
        ref: 'TowatchSong'
    }
    ]          
})

module.exports = mongoose.model('Artist' , artistSchema);