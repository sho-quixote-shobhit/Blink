const mongoose  = require('mongoose')

const towatchSchema = new mongoose.Schema({
    videoId : String,
    channelId : String,
    title : String,
    image : String,
    time : String,
    channelTitle : String,
    artist_name : String
})


module.exports =  mongoose.model('TowatchSong' , towatchSchema);