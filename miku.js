const Discord = require('discord.js')
const ytdl = require('ytdl-core')
const ytsr = require('ytsr')
const fs = require('fs')
const mm = require('music-metadata')
const events = require('events')
const client = new Discord.Client()

var settings = require('./config.json')
var finishSong = false
var finishQueue = false
var autoplay = true
var repeatSong = 0

var queue = []
var autoplayQueue = []
var autoplayList = []
var nowPlaying
var paused = false

var voiceChannel
var connection
var dispatcher
var channel

const { fork } = require('child_process')
var sample = fork('sample.js')
/*setInterval(() => {
  sample.kill('SIGCONT')
  setTimeout(() => {
    sample.kill('SIGSTOP')
  }, 15)
}, 100)*/

function autoplayInit () {
  return new Promise((resolve) => {
    let list = []
    autoplayList = []
    fs.readdir('./autoplay/', async function (err, files) {
      if (err) throw err
      for (let i = 0; i < files.length; i++) {
        await mm.parseFile('./autoplay/' + files[i]).then(function (metadata) {
          const min = Math.floor(Math.floor(metadata.format.duration) / 60)
          let sec
          if (Math.floor(metadata.format.duration) % 60 < 10) {
            sec = '0' + Math.floor(metadata.format.duration) % 60
          } else {
            sec = Math.floor(metadata.format.duration) % 60
          }
          const duration = min + ':' + sec
          const data = {
            fileName: files[i],
            title: metadata.common.title,
            duration: duration,
            artist: metadata.common.artist,
            id: 'Autoplay'
          }
          list.push(data)
          autoplayList.push(data)
        })
      }
      for (let i = list.length - 1; i > -1; i--) {
        const j = Math.floor(Math.random() * i)
        const temp = list[i]
        list[i] = list[j]
        list[j] = temp
      }
      for (let i = 0; i < list.length; i++) {
        autoplayQueue.push(list[i])
      }
      resolve(list)
    })
  })
}
autoplayInit()

var ui = new Promise((resolve) => { resolve({ deleted: true }) })
const uiReact = new events.EventEmitter()
uiReact.on('react', (message) => {
  const filter = (reaction, user) => {
    return user.id !== message.author.id
  }
  const collector = message.createReactionCollector(filter, { max: 1 })
  collector.on('collect', function (reaction, user) {
    const userReactions = message.reactions.cache.filter(reaction => reaction.users.cache.has(user.id));
    try {
      for (const reaction of userReactions.values()) {
        reaction.users.remove(user.id);
      }
    } catch (error) {
      console.log('Failed to remove reactions from now playing message')
    }
    uiReact.emit('react', message)
    if (reaction.emoji.name === '⏯') {
      if (dispatcher) {
        if (paused) {
          dispatcher.resume()
          playerStart = Date.now()
          playerTimeout = setTimeout(() => {
            playNext()
          }, playerTimeoutValue)
        }
        else {
          dispatcher.pause(true)
          playerTimeoutValue = playerTimeoutValue - (Date.now() - playerStart)
          clearTimeout(playerTimeout)
        }
        paused = !paused
        sendUI()
      }
    } else if (reaction.emoji.name === '⏹') { stop() }
    else if (reaction.emoji.name === '⏭') {  if (dispatcher) { playNext() } }
    else if (reaction.emoji.name === '🔄') {
      if (nowPlaying) {
        repeatSong += 1
        sendUI()
      }
    }
  })
})

async function sendUI (newChannel) {
  ui.then((message) => {
    if (!message.deleted && !newChannel) {
      message.edit(createUI())
    } else {
      if (!message.deleted) { message.delete() }
      ui = new Promise((resolve) => {
        channel.send(createUI()).then((message) => {
          uiReact.emit('react', message)
          message.react('⏯')
            .then(() => message.react('⏹'))
            .then(() => message.react('⏭'))
            .then(() => message.react('🔄'))
            .then(() => resolve(message))
            .catch(() => resolve(message))
        }).catch(() =>  resolve({ deleted: true }))
      })
    }
  })
}

function createUI () {
  var newMessage = { embed: { color: 1426114 } }
  if (nowPlaying) {
    newMessage.embed.title = 'Now Playing - ' + nowPlaying.title
    if (paused) { newMessage.embed.title = '[PAUSED] - ' + nowPlaying.title }
    let queueMessage = ''
    for (let i = 0; i < 5; i++) {
      if (i < queue.length && !finishSong) {
        queueMessage = queueMessage.concat('\n', i + 1, '. ', queue[i].title, ' -[', queue[i].id + ']')
      } else if (autoplay && i - queue.length < autoplayQueue.length && !finishQueue && !finishSong) {
        queueMessage = queueMessage.concat('\n', i + 1, '. ', autoplayQueue[i - queue.length].title, ' -[autoplay]')
      }
    }
    if (queueMessage === '') {
      queueMessage = 'Nothing in Queue'
    }
    let autoStop = 'Autostop is disabled'
    if (finishSong) {
      autoStop = 'Automatically stopping after this song'
    }
    if (finishQueue) {
      autoStop = 'Automatically stopping after finishing the queue'
    }
    let duration = nowPlaying.duration
    if (nowPlaying.live) { duration = 'live' }
    if (!nowPlaying.fileName) {
      newMessage.embed.thumbnail = { url: nowPlaying.thumbnail }
      newMessage.embed.fields = [
        { name: 'Requested by', value: nowPlaying.id, inline: true },
        { name: 'Duration', value: duration, inline: true },
        { name: 'Youtube Link', value: nowPlaying.link, inline: true },
        { name: 'Queue:', value: queueMessage },
        { name: 'Autoplay', value: autoplay, inline: true},
        { name: 'Repeat', value: repeatSong + ' time(s)', inline: true},
        { name: 'Auto Stop', value: autoStop, inline: true}
      ]
    } else {
      newMessage.embed.thumbnail = { url: 'https://i.imgur.com/ZJQhzhs.jpg' }
      newMessage.embed.fields = [
        { name: 'Requested by', value: nowPlaying.id, inline: true },
        { name: 'Duration', value: duration, inline: true },
        { name: 'Artist', value: nowPlaying.artist, inline: true },
        { name: 'Queue:', value: queueMessage },
        { name: 'Autoplay', value: autoplay, inline: true},
        { name: 'Repeat', value: repeatSong + ' time(s)', inline: true},
        { name: 'Auto Stop', value: autoStop, inline: true}
      ]
    }
  } else {
    newMessage.embed.title = 'Listening for commands'
    newMessage.embed.thumbnail = { url: 'https://s1.zerochan.net/Hatsune.Miku.600.1769011.jpg' }
    newMessage.embed.description = 'Type "' + settings.prefix + 'help" for a list of avaliable commands'
    newMessage.embed.fields = [ { name: 'Autoplay', value: autoplay } ]
  }
  return newMessage
}

var showQueueMessage = new Promise((resolve) => { resolve({ deleted: true }) })
var showQueuePage = 1
var showQueueRequest = undefined
const showQueueReact = new events.EventEmitter()
var showQueueTimeout = undefined
showQueueReact.on('react', (message) => {
  const filter = (reaction, user) => { return user.id !== message.author.id }
  const collector = message.createReactionCollector(filter, { max: 1 })
  collector.on('collect', function (reaction, user) {
    clearTimeout(showQueueTimeout)
    showQueueTimeout = setTimeout(function () { showQueueMessage.then((message) => { if (!message.deleted) { message.delete() } }) }, 60000)
    const userReactions = message.reactions.cache.filter(reaction => reaction.users.cache.has(user.id))
    try {
      for (const reaction of userReactions.values()) {
        reaction.users.remove(user.id)
      }
    } catch (error) {
      console.log('Failed to remove reactions from now show queue message')
    }
    if (reaction.emoji.name === '❌') {
      showQueueMessage.then((message) => { if (!message.deleted) { message.delete() } })
    } else if (reaction.emoji.name === '⬅') {
      showQueueReact.emit('react', message)
      if (showQueuePage > 1) { showQueuePage -= 1 }
      message.edit(createQueueMessage())
    } else if (reaction.emoji.name === '➡') {
      showQueueReact.emit('react', message)
      if (showQueuePage < Math.ceil((autoplayQueue.length + queue.length) / 20)) { showQueuePage += 1 }
      message.edit(createQueueMessage())
    }
  })
})

function showQueue (request, page) {
  showQueuePage = page
  showQueueRequest = request
  clearTimeout(showQueueTimeout)
  showQueueMessage.then((message) => {
    showQueueTimeout = setTimeout(function () { showQueueMessage.then((message) => { if (!message.deleted) { message.delete() } }) }, 60000)
    if (!message.deleted) {
      message.edit(createQueueMessage())
    } else {
      showQueueMessage = new Promise(function (resolve) {
        channel.send(createQueueMessage()).then((message) => {
          showQueueReact.emit('react', message)
          message.react('⬅')
            .then(() => message.react('➡'))
            .then(() => message.react('❌'))
            .then(() => resolve(message))
            .catch(() => resolve(message))
        }).catch(() => resolve(message))
      })
    }
  })
}

function createQueueMessage () {
  var newMessage = { embed: { title: 'Queue', color: 1426114 } }
  if (showQueuePage > Math.ceil((autoplayQueue.length + queue.length) / 20) && showQueuePage !== 1) {
    newMessage.embed.description = '<@!' + showQueueRequest.author.id + '> The queue is only ' + Math.ceil((autoplayQueue.length + queue.length) / 20) + ' pages long'
  } else {
    let queueMessage = ''
    for (let i = (showQueuePage - 1) * 20; i < showQueuePage * 20; i++) {
      if (i < queue.length && !finishSong) {
        queueMessage = queueMessage.concat('\n', i + 1, '. ', queue[i].title, ' [', queue[i].id + ']')
      } else if (autoplay && i - queue.length < autoplayQueue.length && !finishQueue) {
        queueMessage = queueMessage.concat('\n', i + 1, '. ', autoplayQueue[i - queue.length].title, ' [autoplay]')
      }
    }
    if (queueMessage === '') {
      queueMessage = 'Nothing in Queue'
    }
    newMessage.embed.description = queueMessage
    newMessage.embed.footer = { text: 'Showing page ' + showQueuePage + ' of ' + Math.ceil((autoplayQueue.length + queue.length) / 20) }
  }
  return newMessage
}

var notification = new Promise (function (resolve) { resolve({ deleted: true }) } )
var notificationTimeout = undefined
function sendError (text, textChannel) {
  if (!textChannel) {
    clearTimeout(notificationTimeout)
    setTimeout(() => { notification.then((message) => { if (!message.deleted) { message.delete() } }) }, 60000)
    notification.then((message) => {
      if (!message.deleted) {
        message.edit({ embed: { color: 13188374, description: text } })
      } else {
        notification = new Promise (function (resolve) {
          channel.send({ embed: { color: 13188374, description: text } }).then((message) => {
            const filter = (reaction, user) => { return user.id !== message.author.id }
            const collector = message.createReactionCollector(filter, { max: 1 })
            collector.once('collect', function (reaction, user) {
              if (reaction.emoji.name === '❌') { notification.then((message) => { if (!message.deleted) { message.delete() } }) }
              else {
                const userReactions = message.reactions.cache.filter(reaction => reaction.users.cache.has(user.id));
                try {
                  for (const reaction of userReactions.values()) {
                    reaction.users.remove(user.id);
                  }
                } catch (error) {
                  console.log('Failed to remove reactions from error message')
                }
              }
            })
            message.react('❌')
              .then(() => resolve(message))
              .catch(() => resolve(message))
          }).catch(() =>  resolve({ deleted: true }))
        })
      }
    })
  } else {
    textChannel.send({ embed: { color: 13188374, description: text } }).then((message) => {
      message.react('❌')
      const filter = (reaction, user) => { return user.id !== message.author.id }
      const collector = message.createReactionCollector(filter, { max: 1 })
      collector.once('collect', function (reaction, user) {
        if (reaction.emoji.name === '❌') { if (!message.deleted) { message.delete() } }
        else {
          const userReactions = message.reactions.cache.filter(reaction => reaction.users.cache.has(user.id));
          try {
            for (const reaction of userReactions.values()) {
              reaction.users.remove(user.id);
            }
          } catch (error) {
            console.log('Failed to remove reactions from error message')
          }
        }
      })
    })
  }
}

function sendNotification (text, textChannel) {
  if (!textChannel) { textChannel = channel }
  clearTimeout(notificationTimeout)
  setTimeout(() => { notification.then((message) => { if (!message.deleted) { message.delete() } }) }, 60000)
  notification.then((message) => {
    if (!message.deleted) {
      message.edit({ embed: { color: 7506394, description: text } })
    } else {
      notification = new Promise (function (resolve) {
        textChannel.send({ embed: { color: 7506394, description: text } }).then((message) => {
          const filter = (reaction, user) => { return user.id !== message.author.id }
          const collector = message.createReactionCollector(filter, { max: 1 })
          collector.once('collect', function (reaction, user) {
            if (reaction.emoji.name === '❌') { notification.then((message) => { if (!message.deleted) { message.delete() } }) }
            else {
              const userReactions = message.reactions.cache.filter(reaction => reaction.users.cache.has(user.id));
              try {
                for (const reaction of userReactions.values()) {
                  reaction.users.remove(user.id);
                }
              } catch (error) {
                console.log('Failed to remove reactions from now notification')
              }
            }
          })
          message.react('❌')
            .then(() => resolve(message))
            .catch(() => resolve(message))
        }).catch(() =>  resolve({ deleted: true }))
      })
    }
  })
}

async function joinVoice (message) {
  voiceChannel = message.member.voice.channel
  if (!voiceChannel) {
    sendError('<@!' + message.author.id + '> Please join a voice channel to play music')
    return false
  } else {
    connection = await voiceChannel.join()
    sendNotification('Joined <@!' + message.author.id + '> in the voice channel named: ' + voiceChannel.name)
    return true
  }
}

var playerStart
var playerTimeoutValue = 0
var playerTimeout = undefined
function player (play) {
  var temp = play.duration.split(':')
  for (let i = temp.length; i > 0; i--) {
    playerTimeoutValue += parseInt(temp[i - 1]) * 1000 * 60**(temp.length - i)
  }
  clearTimeout(autostopTimeout)
  clearTimeout(playerTimeout)
  var stream = undefined
  if (play.fileName) {
    stream = fs.createReadStream('./autoplay/' + play.fileName)
  } else if (play.live) {
    stream = ytdl(play.link, { quality: [91, 92, 93, 94, 95] })
    total = 21590000
  } else {
    stream = ytdl(play.link, { filters: 'audioonly' })
  }
  dispatcher = connection.play(stream, { volume: 0.25 })
  var buffers = []
  var started = false
  var timeout = 3000
  var avgVol = 0.25
  stream.on('data', (data) => {
    buffers.push(data)
    if (!started && !play.live) {
      started = true
      var buffer = Buffer.concat(buffers)
      fs.writeFile('./temp', buffer, function() {
        sample.send(timeout)
      })
    }
  })
  sample.on('message', (change) => {
    sample.kill('SIGKILL')
    sample = fork ('sample.js')
    timeout += 100
    if (change !== 'error') {
      avgVol = (avgVol + change) / 2
      if (dispatcher) { dispatcher.setVolume(avgVol) }
    }
    var buffer = Buffer.concat(buffers)
    fs.writeFile('./temp', buffer, function() {
      sample.send(timeout)
    })
  })
  dispatcher.on('start', () => {
    playerStart = Date.now()
    playerTimeout = setTimeout(() => {
      playNext()
    }, playerTimeoutValue)
    paused = false
    sendUI()
  })
}

var autostopTimeout = undefined
function playNext () {
  sample.kill('SIGKILL')
  sample = fork ('sample.js')
  if (autoplay && autoplayQueue.length < 10) { autoplayInit() }
  if (dispatcher) { dispatcher.destroy() }
  if (repeatSong === 0) {
    nowPlaying = undefined
    if (queue.length > 0) {
      if (finishSong) {
        stop()
        return
      } else {
        nowPlaying = queue[0]
        queue.shift()
      }
    } else if (queue.length === 0) {
      if (finishQueue || finishSong) {
        stop()
        return
      } else if (autoplay) {
        nowPlaying = autoplayQueue[0]
        autoplayQueue.shift()
      } else {
        sendUI()
        sendNotification('Nothing to play, leaving voice channel in 60 seconds')
        autostopTimeout = setTimeout(() => { stop() }, 60000)
        return
      }
    }
  } else if (repeatSong > 0) { repeatSong -= 1}
  player(nowPlaying)
}

function queuer (message, song) {
  if (finishSong) {
    sendError('<@!' + message.author.id + '> Auto stop is set to finish song, disable it if you\'d like to add music to the queue')
    return
  } else if (finishQueue) {
    sendError('<@!' + message.author.id + '> Auto stop is set to finish queue, disable it if you\'d like to add music to the queue')
    return
  }
  if (!connection) {
    joinVoice(message).then(function (connected) {
      if (connected) {
        queue.push(song)
        if (queue.length === 1 && !nowPlaying) { playNext() }
        else { sendNotification('<@!' + message.author.id + '> Added ' + song.title + ' to the queue') }
      }
    })
  } else {
    queue.push(song)
    if (queue.length === 1 && !nowPlaying) { playNext() }
    else { sendNotification('<@!' + message.author.id + '> Added ' + song.title + ' to the queue') }
  }
  sendUI()
}

function stop () {
  sample.kill('SIGKILL')
  showQueueMessage.then((message) => { if (!message.deleted) { message.delete() } })
  searchMessage.then((message) => { if (!message.deleted) { message.delete() } })
  notification.then((message) => { if (!message.deleted) { message.delete() } })
  paused = false
  nowPlaying = undefined
  finishSong = false
  finishQueue = false
  repeatSong = 0
  queue = []
  if (voiceChannel) { voiceChannel.leave() }
  if (dispatcher) { dispatcher.destroy() }
  voiceChannel = undefined
  connection = undefined
  dispatcher = undefined
  sendUI()
}

async function searchYT (search, results) {
  try {
    const filters = await ytsr.getFilters(search)
    const filter = await filters.get('Type').find(o => o.name === 'Video')
    const options = {
      limit: results,
      nextpageRef: filter.ref
    }
    return await ytsr(null, options)
  } catch {
    return undefined
  }
}

async function searchAutoplay (searching) {
  var search = []
  var short = []
  var searching = searching.split(' ')
  for (let i = 0; i < searching.length; i++) {
    if (searching[i].length >= 3) { search.push(searching[i]) }
    else { short.push(searching[i]) }
  }
  let max = 0
  let results = []
  for (let i = 0; i < autoplayList.length; i++) {
    let currentScore = 0
    let current = autoplayList[i].title.split(' ')
    let found = false
    for (let j = 0; j < current.length; j++) {
      for (let n = 0; n < search.length; n++) {
        if (removeSpecial(search[n].toUpperCase()) === removeSpecial(current[j].toUpperCase())) {
          currentScore += 3
        }
      }
      for (let m = 0; m < short.length; m++) {
        if (removeSpecial(short[m].toUpperCase()) === removeSpecial(current[j].toUpperCase())) {
          currentScore += 1
        }
      }
    }
    autoplayList[i].score = currentScore
    if (currentScore > 0) { results.push(autoplayList[i]) }
  }
  results = results.sort(function(a, b){return b.score - a.score})
  return results
}

function isNumber (text) {
  if(text) {
    var reg = new RegExp('[0-9]+$');
    return reg.test(text);
  }
  return false;
}

function removeSpecial (text) {
  if(text) {
    var lower = text.toLowerCase();
    var upper = text.toUpperCase();
    var result = "";
    for(var i=0; i<lower.length; ++i) {
      if(isNumber(text[i]) || (lower[i] != upper[i]) || (lower[i].trim() === '')) {
        result += text[i];
      }
    }
    return result;
  }
  return '';
}

var searchMessage = new Promise (function (resolve) { resolve({ deleted: true }) })
var searchResults = { items: [] }
var searchPage = 1
var ytPage = 0
const searchReact = new events.EventEmitter()
var searchTimeout = setTimeout(() => {}, 60000)
clearTimeout(searchTimeout)
searchReact.on('react', (message) => {
  const filter = (reaction, user) => { return user.id !== message.author.id }
  const collector = message.createReactionCollector(filter, { max: 1 })
  collector.once('collect', function (reaction, user) {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(function () { searchMessage.then((message) => { if (!message.deleted) { message.delete() } }) }, 60000)
    const userReactions = message.reactions.cache.filter(reaction => reaction.users.cache.has(user.id))
    try {
      for (const reaction of userReactions.values()) {
        reaction.users.remove(user.id)
      }
    } catch (error) {
      console.log('Failed to remove reactions from now search message')
    }
    if (reaction.emoji.name === '❌') {
      searchMessage.then((message) => { if (!message.deleted) { message.delete() } })
    } else if (reaction.emoji.name === '⬅') {
      if (searchPage > 1) { searchPage -= 1 }
      message.edit(createSearchMessage())
      searchReact.emit('react', message)
    } else if (reaction.emoji.name === '➡') {
      if (searchPage < searchResults.items.length) { searchPage += 1 }
      message.edit(createSearchMessage())
      searchReact.emit('react', message)
    } else if (reaction.emoji.name === '☑') {
      for (let i = 0; i < autoplayQueue.length; i++) {
        if (autoplayQueue[i].fileName === searchResults.items[searchPage - 1].fileName && autoplay) {
          autoplayQueue.splice(i, 1)
        }
      }
      searchResults.items[searchPage - 1].id = '<@!' + searchResults.request.author.id + '>'
      queuer(searchResults.request, searchResults.items[searchPage - 1])
      searchMessage.then((message) => { if (!message.deleted) { message.delete() } })
    } else if (reaction.emoji.name === '⏭') {
      if (searchResults.items.length > ytPage + 1) {
        searchPage = ytPage + 1
        message.edit(createSearchMessage())
      } else { message.edit(createSearchMessage(true))}
      searchReact.emit('react', message)
    }
  })
})

function search (search, request) {
  clearTimeout(searchTimeout)
  searchMessage.then(async (message) => {
    searchResults.query = search
    searchResults.request = request
    searchResults.items = []
    searchTimeout = setTimeout(function () { searchMessage.then((message) => { if (!message.deleted) { message.delete() } }) }, 60000)
    const ytResult = await searchYT(search, 20)
    const autoplayResult = await searchAutoplay(search, ytResult)
    if (autoplayResult) {
      ytPage = autoplayResult.length
      for (let i = 0; i < autoplayResult.length; i++) { searchResults.items.push(autoplayResult[i]) }
    }
    if (ytResult) { for (let i = 0; i < ytResult.items.length; i++) { searchResults.items.push(ytResult.items[i]) } }
    searchPage = 1
    if (!message.deleted) {
      message.edit(createSearchMessage())
    } else {
      searchMessage = new Promise(function (resolve) {
        channel.send(createSearchMessage()).then((message) => {
          searchReact.emit('react', message)
          message.react('⬅')
            .then(() => message.react('☑'))
            .then(() => message.react('➡'))
            .then(() => message.react('⏭'))
            .then(() => message.react('❌'))
            .then(() => resolve(message))
            .catch(() => resolve(message))
        }).catch(() =>  resolve({ deleted: true }))
      })
    }
  })
}

function createSearchMessage (notFound) {
  let newMessage = undefined
  if (searchResults.items.length > 0 && !notFound) {
    if (!searchResults.items[searchPage - 1].duration) { searchResults.items[searchPage - 1].duration = 'live' }
    if (!searchResults.items[searchPage - 1].fileName) {
      newMessage = {
        embed: {
          color: 12857387,
          title: 'Search Results for "' + searchResults.query + '"',
          fields: [
            { name: 'Title', value: searchResults.items[searchPage - 1].title, inline: true },
            { name: 'Duration', value: searchResults.items[searchPage - 1].duration, inline: true },
            { name: 'Uploaded by', value: searchResults.items[searchPage - 1].author.name, inline: true },
            { name: 'Link', value: searchResults.items[searchPage - 1].link, inline: false }
          ],
          thumbnail: { url: searchResults.items[searchPage - 1].thumbnail },
          footer: {
            text: 'Search result ' + searchPage + ' out of ' + searchResults.items.length
          }
        }
      }
    } else {
      newMessage = {
        embed: {
          color: 12857387,
          title: 'Search Results for "' + searchResults.query + '"',
          fields: [
            { name: 'Title', value: '[Autoplay] - ' + searchResults.items[searchPage - 1].title, inline: true },
            { name: 'Duration', value: searchResults.items[searchPage - 1].duration, inline: true },
          ],
          thumbnail: { url: 'https://i.imgur.com/ZJQhzhs.jpg' },
          footer: {
            text: 'Search result ' + searchPage + ' out of ' + searchResults.items.length
          }
        }
      }
    }
  } else {
    newMessage = {
      embed: {
        color: 12857387,
        title: 'Search Results for "' + searchResults.query + '"',
        description: 'Nothing Found!'
      }
    }
  }
  return newMessage
}

client.login(settings.token)
client.once('ready', async function () {
  console.log('Ready!')
  channel = await client.channels.cache.get(settings.channelID)
  try { sendUI() } catch { console.log('set a channel!')}
})

client.on('message', async function (message) {
  message.content.toLowerCase()
  if (message.author.bot) return
  if (!message.content.startsWith(settings.prefix.toLowerCase())) return
  if (message.content.startsWith(settings.prefix.toLowerCase()) && message.channel.id === settings.channelID) {
    message.delete()
    message.content = message.content.replace(settings.prefix, '')
  } else if (message.channel.id !== settings.channelID) { return }
  if (message.content === 'set channel') {
    settings.channelID = message.channel.id
    fs.writeFile('config.json', JSON.stringify(settings), (error) => { if (error) throw error })
    channel = await client.channels.cache.get(settings.channelID)
    sendUI()
  } else if (!settings.channelID) {
    sendError('Do "' + settings.prefix + 'set channel" then restart the bot!', message.channel)
  } else if (message.content === 'join') { joinVoice(message) }
  else if (message.content.startsWith('play ') || message.content.startsWith('search ')) {
    message.content = message.content.replace('play ', '')
    message.content = message.content.replace('search ', '')
    search(message.content, message)
  } else if (message.content === 'play' || message.content === 'resume') {
    if (!nowPlaying && autoplay) {
      joinVoice(message).then(function (connected) {
        if (connected) {
          paused = false
          playNext()
        }
      })
    } else if (!dispatcher) {
      sendError('<@!' + message.author.id + '> There\'s nothing to resume')
    } else {
      paused = false
      dispatcher.resume()
      playerStart = Date.now()
      playerTimeout = setTimeout(() => {
        playNext()
      }, playerTimeoutValue)
      sendUI()
    }
  } else if (message.content === 'skip' || message.content === 'next') {
    if (!dispatcher) {
      sendError('<@!' + message.author.id + '> There\'s nothing to skip')
    } else {
      playNext()
    }
  } else if (message.content === 'pause') {
    if (!dispatcher) {
      sendError('<@!' + message.author.id + '> There\'s nothing to pause')
    } else if (nowPlaying.live) {
      sendError('<@!' + message.author.id + '> Live videos cannot be paused')
    } else if (!paused) {
      dispatcher.pause(true)
      playerTimeoutValue = playerTimeoutValue - (Date.now() - playerStart)
      clearTimeout(playerTimeout)
      paused = true
      sendUI()
    }
  } else if (message.content === 'repeat 0') {
    if (nowPlaying) {
      repeatSong = 0
      sendUI()
    } else { sendError('<@!' + message.author.id + '> Nothing to repeat') }
  } else if (message.content.startsWith('repeat ')) {
    if (nowPlaying) {
      var times = parseInt(message.content.replace('repeat ', ''))
      if (!times) { sendError('<@!' + message.author.id + '> That was not an integer') }
      else {
        repeatSong = times
        sendUI()
      }
    } else { sendError('<@!' + message.author.id + '> Nothing to repeat') }
  } else if (message.content === 'stop' || message.content === 'commit seppuku') { stop() }
  else if (message.content === 'show queue') { showQueue(message, 1) }
  else if (message.content.startsWith('show queue ')) {
    const page = parseInt(message.content.replace('show queue ', ''))
    if (!page) { sendError('<@!' + message.author.id + '> That was not an integer') }
    else { showQueue(message, page) }
  } else if (message.content.startsWith('advance ')) {
    message.content = message.content.replace('advance ', '')
    const index = parseInt(message.content)
    if (!index) { sendError('<@!' + message.author.id + '> That was not an integer') }
    else if (index > queue.length + autoplayQueue.length) { sendError('<@!' + message.author.id + '> The queue is not that long') }
    else {
      if (index <= queue.length) {
        const temp = queue[index - 1]
        queue.splice(index - 1, 1)
        queue.unshift(temp)
      } else {
        const temp = autoplayQueue[index - queue.length - 1]
        temp.message = message
        autoplayQueue.splice(index - queue.length - 1, 1)
        queue.unshift(temp)
      }
      sendUI()
    }
  } else if (message.content.startsWith('remove ')) {
    message.content = message.content.replace('remove ', '')
    const index = parseInt(message.content)
    if (!index) { sendError('<@!' + message.author.id + '> That was not an integer') }
    else if (index > queue.length + autoplayQueue.length) { sendError('<@!' + message.author.id + '> The queue is not that long') }
    else {
      if (index <= queue.length) {
        queue.splice(index - 1, 1)
      } else {
        autoplayQueue.splice(index - queue.length - 1, 1)
      }
      sendUI()
    }
  } else if (message.content === 'clear queue') {
    queue = []
    sendNotification('<@!' + message.author.id + '> Cleared the queue')
    sendUI()
  } else if (message.content === 'toggle autoplay') {
    autoplay = !autoplay
    sendNotification('<@!' + message.author.id + '> Set autoplay to ' + autoplay)
    if (autoplay) {
      autoplayQueue = []
      autoplayInit().then(() => sendUI())
    } else {
      autoplayQueue = []
      sendUI()
    }
  } else if (message.content === 'autostop finish song' || message.content === 'autostop fs' || message.content === 'as fs') {
    finishQueue = false
    finishSong = !finishSong
    sendNotification('<@!' + message.author.id + '> Set autostop to finish song')
    sendUI()
  } else if (message.content === 'autostop finish queue' || message.content === 'autostop fq' || message.content === 'as fq') {
    finishSong = false
    finishQueue = !finishQueue
    sendNotification('<@!' + message.author.id + '> Set autostop to finish queue')
    sendUI()
  } else if (message.content === 'autostop disable'  || message.content === 'autostop d' || message.content === 'as d') {
    finishSong = false
    finishQueue = false
    sendNotification('<@!' + message.author.id + '> Disabled autostop')
    sendUI()
  } else if (message.content === 'help') {
    const newMessage = new Discord.MessageEmbed()
      .setColor('#7289da')
      .setTitle('Avaiable Commands')
      .setDescription('**"' + settings.prefix + 'join"**\nBot joins the voice channel the user is in.\n\n' +
      '**"' + settings.prefix + 'play"**\n Bot will attempt to start or resume playing anything in the queue' +
      '**"' + settings.prefix + 'play [query]"**\nBot will search avaliable autoplay entries as well as youtube for the query. User can then choose which one to play using the reactions' + ' If something is already playing, it will add it to the queue.\n\n' +
      '**"' + settings.prefix + 'pause"**\nPauses what the bot is playing.\n\n' +
      '**"' + settings.prefix + 'resume"**\nResumes what was paused.\n\n' +
      '**"' + settings.prefix + 'skip" or "' + settings.prefix + 'next"**\nSkips the current song and moves onto the next song in the queue.\n\n' +
      '**"' + settings.prefix + 'repeat [times]"**\nHow many times to repeat the current song. A value of -1 will result in indefinite repeats\n\n' +
      '**"' + settings.prefix + 'remove [queue index]"**\nRemoves that entrie from the queue.\n\n' +
      '**"' + settings.prefix + 'advance [queue index]"**\nMoves the corresponding song in the queue to the top.\n\n' +
      '**"' + settings.prefix + 'clear queue"**\nBot will clear the current queue.\n\n' +
      '**"' + settings.prefix + 'stop"**\nImmediately stops playing, clears the queue, and leaves the voice channel.\n\n' +
      '**"' + settings.prefix + 'autostop finish song"**\nWhether or not the bot will finish playing the current song then leave. New requests will not be honored when true.\n\n' +
      '**"' + settings.prefix + 'autostop finish queue"**\nWhether or not the bot will finish playing the queue then leave. New requests will not be honored when true.\n\n' +
      '**"' + settings.prefix + 'autostop disable"**\nDisabes both finish song and finish queue.\n\n' +
      '**"' + settings.prefix + 'toggle autoplay"**\nToggles whether or not bot will play songs from the autoplay folder when queue is empty. When disabled, bot will automatically leave after 60 seconds when queue is empty.\n\n' +
      '**"' + settings.prefix + 'set channel"**\nBot sets the channel the bot will listen to. Bot will notify users if they try to user a different channel.\n\n' +
      '**"' + settings.prefix + 'clear channel [x]"**\nBot will delete that last x messages in the channel. Note that you can only delete messages less than 14 days old.')
    client.users.cache.get(message.author.id).send(newMessage)
  } else if (message.content.startsWith('clear channel ')) {
    message.content = message.content.replace('clear channel ', '')
    const number = parseInt(message.content)
    if (!number) {
      sendError('<@!' + message.author.id + '> That was not an integer')
    } else if (number > 100) {
      sendError('<@!' + message.author.id + '> You can only delete up to 100 messages at a time')
    } else {
      message.channel.bulkDelete(number).then(() => {
        setTimeout(() => {
          sendUI()
          sendNotification('<@!' + message.author.id + '> Deleted ' + number + ' messages')
        }, 1000)
      }).catch()
    }
  } else {
    sendError('<@!' + message.author.id + '> That is not a valid command. Type "' + settings.prefix + 'help" to show the list of avaliable commands.')
  }
})
