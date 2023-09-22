const mongoose = require('mongoose')
const passportlocalmongoose = require('passport-local-mongoose')

const { Schema } = mongoose;

const Artist = require('./artist')
const WatchedSong = require('./watched')
const TowatchSong = require('./towatch')
const AllSong = require('./allsearch')

const UserSchema = new Schema({
    artist_name : String,
    email: {
        type: String,
        required: true,
        unique: true
    },
    artists : [
        {
            type : Schema.Types.ObjectId,
            ref : 'Artist'
        }
    ],
    watched : [
        {
            type : Schema.Types.ObjectId,
            ref : 'WatchedSong'
        }
    ],
    towatch : [
        {
            type : Schema.Types.ObjectId,
            ref : 'TowatchSong'
        }
    ],
    allsongs : [
    
        {
            type : Schema.Types.ObjectId,
            ref : 'AllSong'
        }
    ]
})

UserSchema.plugin(passportlocalmongoose);

module.exports = mongoose.model('User', UserSchema);