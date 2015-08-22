var Promise = require('promise'),
    urlapi = require('url'),
    creds = require('./rdio_consumer_credentials.js'),
    SpotifyWebApi = require('spotify-web-api-node'),
    qs = require('querystring'),
    Rdio = require('rdio')({
      rdio: {
        clientId: creds.RDIO_CONSUMER_KEY,
        clientSecret: creds.RDIO_CONSUMER_SECRET
      }
    });

var rdio = new Rdio();
var spotify = new SpotifyWebApi();
String.prototype.includes = function(str) {
  return this.indexOf(str) > -1;
};

handlers = {
  google: function(url, callback) {
    var artist_and_track = urlapi.parse(url, true).query.t.match(/(.*)_-_(.*)/);
    callback(artist_and_track[1], artist_and_track[2]);
  },
  rdio: function(url, callback) {
    rdio.getClientToken(function () {
      rdio.tokens.accessToken = rdio.tokens.clientToken;

      rdio.request({
          method: 'getObjectFromUrl',
          url: url
      }, function(err, response) {
        if (err) {
          callback(err, url);
        }

        callback(response.result.name, response.result.artist);
      });
    });
  },
  spotify: function(url, callback) {
    var id = url.match(/track[:,/](.*)/)[1];

    spotify.getTrack(id)
      .then(function(data) {
        callback(data.body.name, data.body.artists[0].name);
      }, function(err) {
        callback(err, url);
      });
  }
};

exports.handler = function(event, context) {
  var params = qs.parse(event.query);

  if(params.user_id == "USLACKBOT") {
    context.succeed({});
    return;
  }

  var url = params.text.replace(/[<>]/g, '');

  var urlHandler;
  if(url.includes('spotify')) {
    urlHandler = handlers.spotify;
  } else if(url.includes('rdio') || url.includes('rd.io')) {
    urlHandler = handlers.rdio;
  } else if(url.includes('google')) {
    urlHandler = handlers.google;
  }

  urlHandler(url, function(track, artist) {
    var text = '';

    Promise.all([
      new Promise(function(resolve, reject) {
        resolve('https://www.youtube.com/results?search_query=' + qs.escape(track + ' ' + artist));
      }),
      new Promise(function(resolve, reject) {
        rdio.getClientToken(function() {
          rdio.tokens.accessToken = rdio.tokens.clientToken;
          rdio.request({
              method: 'search',
              types: 'Track',
              query: artist + ' ' + track,
              count: 1
          }, function(err, response) {
            if (err) {
              reject(err);
            }
            resolve('rdio://www.rdio.com/' + response.result.results[0].url);
          });
        });
      }),
      new Promise(function(resolve, reject) {
        spotify.searchTracks('artist:' + artist + ' ' + track)
          .then(function(data) {
            resolve(data.body.tracks.items[0].uri);
          }, function(err) {
            reject(err);
          });
      })
    ]).then(function(results) {
      results.forEach(function(url) {
        text = text.concat(url + '\n');
      });

      context.succeed({ text: text });
    });
  });
};
