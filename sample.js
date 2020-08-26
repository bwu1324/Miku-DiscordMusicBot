const fs = require('fs')
var AudioContext = require('web-audio-api').AudioContext
context = new AudioContext
var exec = require('child_process').exec;
var _ = require('underscore');
var timeout
process.on('message', (msg) => {
  clearTimeout(timeout)
  timeout = setTimeout(() => {
    process.send('error')
  }, msg)
  fs.readFile('./temp', function(err, buf) {
    if (err) throw err
    context.decodeAudioData(buf, function(audioBuffer) {
      pcmdata = audioBuffer.getChannelData(0)
      var amps = []
      var total = 0
      for (let i = 0; i < pcmdata.length; i += 44100) {
        var max = 0
        for (var j = i; j < i + 882; j++) {
          max = pcmdata[j] > max ? pcmdata[j].toFixed(1) : max
        }
        max = parseFloat(max)
        if (max > 0) { amps.push(max) }
      }
      for (let i = 0; i < amps.length; i++) {
        total += amps[i]
      }
      var volume = 0.25 * amps.length / total
      if (amps.length < 1) {
      	var volume = 'error'
      }
      process.send(volume)
    }, function(err) {
      process.send('error')
   })
  })
})
