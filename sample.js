const fs = require('fs')
var AudioContext = require('web-audio-api').AudioContext
context = new AudioContext
var exec = require('child_process').exec;
var _ = require('underscore');
var timeout
var lastLength = 0
process.on('message', (msg) => {
  clearTimeout(timeout)
  timeout = setTimeout(() => {
    process.send('error')
  }, msg)
  fs.readFile('./temp', function(err, buf) {
    if (err) throw err
    context.decodeAudioData(buf, function(audioBuffer) {
      pcmdata = audioBuffer.getChannelData(0)
      if (pcmdata.length >= lastLength) {
      	lastLength = pcmdata.length
      	var max = 0
      	var volume = 1
      	for (let i = 0; i < pcmdata.length; i++) {
          max = pcmdata[i] > max ? pcmdata[i].toFixed(1) : max
          max = parseFloat(max)
      	}
      	if (max === 0.0) {
      	  volume = 'error'
      	} else {
      	  volume = 0.25 / max
      	}
      	process.send(volume)
      } else {
      	process.send('error')
      }
    }, function(err) {
      process.send('error')
   })
  })
})
