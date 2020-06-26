const Discord = require('discord.js')
const ytdl = require('ytdl-core')
const ytsr = require('ytsr')
const fs = require('fs')
const mm = require('music-metadata')
const client = new Discord.Client()

var settings = require('./config.json')
var finishSong = false
var finishQueue = false

var queue = []
var autoplayQueue = []
var nowPlaying
var paused = false

var nowPlayingMessage = { deleted: true }
var showQueueMessage = { deleted: true }
var searchMessages = []
var sentMessages = []
var displayQueue = []
var lastDisplay

var voiceChannel
var connection
var dispatcher

const thumbnail = new Discord.MessageAttachment('./autoplayThumbnail.jpg', 'autoplayThumbnail.jpg')

async function autoplayInit () {
  fs.readdir('./autoplay/', function (err, files) {
    if (err) throw err

    for (let i = files.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * i)
      const temp = files[i]
      files[i] = files[j]
      files[j] = temp
    }
    let index = 0
    meta()
    function meta () {
      mm.parseFile('./autoplay/' + files[index]).then(function (metadata) {
        const min = Math.floor(Math.floor(metadata.format.duration) / 60)
        let sec
        if (Math.floor(metadata.format.duration) % 60 < 10) {
          sec = '0' + Math.floor(metadata.format.duration) % 60
        } else {
          sec = Math.floor(metadata.format.duration) % 60
        }
        const duration = min + ':' + sec
        const data = {
          fileName: files[index],
          title: metadata.common.title,
          duration: duration,
          artist: metadata.common.artist
        }
        autoplayQueue.push(data)
        index++
        if (index < files.length) {
          meta()
        }
      })
    }
  })
}
if (settings.autoplay) {
  autoplayInit()
}

async function joinVoice (message) {
  voiceChannel = message.member.voice.channel

  if (!voiceChannel) {
    displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> Please join a voice channel to play music' })
    return false
  } else {
    connection = await voiceChannel.join()
    displayQueue.push({ type: 'notification', request: message, message: 'Joined <@!' + message.author.id + '> in the voice channel named: ' + voiceChannel.name })
    return true
  }
}

function player (play) {
  if (play.fileName) {
    dispatcher = connection.play('./autoplay/' + play.fileName)
  } else {
    dispatcher = connection.play(ytdl(play.link, { filter: 'audioonly', highWaterMark: 1 << 25 }))
  }

  dispatcher.on('start', function () {
    displayQueue.push({ type: 'nowPlaying', request: play.message })
  })

  dispatcher.on('finish', () => {
    playNext()
  })
}

function playNext () {
  const message = nowPlaying.message
  if (dispatcher) {
    dispatcher.destroy()
  }

  if (queue.length > 0) {
    if (finishSong) {
      displayQueue.push({ type: 'stop' })
      return
    } else {
      nowPlaying = queue[0]
      queue.shift()
    }
  } else if (queue.length === 0) {
    if (finishQueue || finishSong) {
      displayQueue.push({ type: 'stop' })
      return
    } else if (settings.autoplay) {
      nowPlaying = autoplayQueue[0]
      autoplayQueue.shift()
    } else {
      displayQueue.push({ type: 'notification', request: message, message: 'Nothing to play, leaving voice channel in 60 seconds' })
      setTimeout(function () {
        if (!nowPlaying) {
          displayQueue.push({ type: 'stop' })
        }
      }, 60000)
      return
    }
  }

  if (!nowPlaying.message) {
    nowPlaying.message = message
  }
  player(nowPlaying)
}

async function searchYT (message, results) {
  const remove = message.content.startsWith('remove')
  message.content = message.content.replace('play ', '')
  message.content = message.content.replace('search ', '')
  message.content = message.content.replace('remove ', '')
  try {
    const filters = await ytsr.getFilters(message.content)
    const filter = await filters.get('Type').find(o => o.name === 'Video')
    const options = {
      limit: results,
      nextpageRef: filter.ref
    }
    return await ytsr(null, options)
  } catch {
    if (!remove) {
      displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> The search "' + message.content + '" returned no results' })
    }
    return undefined
  }
}

function upDateNowPlaying (newMessage, request) {
  newMessage.setColor('#15c2c2')
  if (!nowPlaying) {
    newMessage.setTitle('Not Playing')
      .addFields(
        { name: 'Autoplay', value: settings.autoplay, inline: true },
        { name: 'Finish song', value: finishSong, inline: true },
        { name: 'Finish queue', value: finishQueue, inline: true }
      )
  } else {
    let status = 'Now Playing - '
    if (paused) {
      status = '[PAUSED] - '
    }
    let queueMessage = ''
    for (let i = 0; i < 5; i++) {
      if (i < queue.length && !finishSong) {
        queueMessage = queueMessage.concat('\n', i + 1, '. ', queue[i].title, ' -[', queue[i].message.author.username + ']')
      } else if (settings.autoplay && i - queue.length < autoplayQueue.length && !finishQueue && !finishSong) {
        queueMessage = queueMessage.concat('\n', i + 1, '. ', autoplayQueue[i - queue.length].title, ' -[autoplay]')
      }
    }
    if (queueMessage === '') {
      queueMessage = 'Nothing in Queue'
    }

    if (!nowPlaying.fileName) {
      newMessage.setTitle(status + nowPlaying.title)
        .setThumbnail(nowPlaying.thumbnail)
        .addFields(
          { name: 'Requested by', value: '<@!' + nowPlaying.message.author.id + '>', inline: true },
          { name: 'Duration', value: nowPlaying.duration, inline: true },
          { name: 'Youtube Link', value: nowPlaying.link, inline: true },
          { name: 'Queue:', value: queueMessage },
          { name: 'Autoplay', value: settings.autoplay, inline: true },
          { name: 'Finish song', value: finishSong, inline: true },
          { name: 'Finish queue', value: finishQueue, inline: true }
        )
    } else {
      newMessage.setTitle(status + nowPlaying.title)
        .attachFiles(thumbnail)
        .setThumbnail('attachment://autoplayThumbnail.jpg')
        .addFields(
          { name: 'Requested by', value: 'Autoplay', inline: true },
          { name: 'Duration', value: nowPlaying.duration, inline: true },
          { name: 'Artist', value: nowPlaying.artist, inline: true },
          { name: 'Queue:', value: queueMessage },
          { name: 'Autoplay', value: settings.autoplay, inline: true },
          { name: 'Finish song', value: finishSong, inline: true },
          { name: 'Finish queue', value: finishQueue, inline: true }
        )
    }
  }

  const temp = request.channel.send(newMessage)
  temp.then(function (message) {
    nowPlayingMessage = message
    if (paused && nowPlaying) {
      message.react('▶')
        .then(() => message.react('⏹'))
        .then(() => message.react('⏭'))
        .then(() => nowPlayingMessageAwaitReaction())
    } else if (nowPlaying) {
      message.react('⏸')
        .then(() => message.react('⏹'))
        .then(() => message.react('⏭'))
        .then(() => nowPlayingMessageAwaitReaction())
    } else {
      displayQueue.shift()
    }
    function nowPlayingMessageAwaitReaction () {
      displayQueue.shift()
      const filter = (reaction, user) => {
        return user.id !== message.author.id
      }

      nowPlayingMessage.collector = message.createReactionCollector(filter, { max: 1 })
      nowPlayingMessage.collector.on('collect', (reaction, user) => {
        if (reaction.emoji.name === '▶') {
          dispatcher.resume()
          paused = false
          displayQueue.push({ type: 'nowPlaying', request: nowPlaying.message })
        } else if (reaction.emoji.name === '⏸') {
          dispatcher.pause()
          paused = true
          displayQueue.push({ type: 'nowPlaying', request: nowPlaying.message })
        } else if (reaction.emoji.name === '⏭') {
          playNext()
        } else if (reaction.emoji.name === '⏹') {
          displayQueue.push({ type: 'stop' })
        }
      })
    }
  })
}

function search (page, request) {
  searchYT(request, 100).then(function (results) {
    if (results) {
      const pages = Math.ceil(results.items.length / 5)
      let upTo = 0
      if (results.items.length < page * 5) {
        upTo = results.items.length
      } else {
        upTo = page * 5
      }
      for (let i = (page - 1) * 5; i < upTo; i++) {
        const newMessage = new Discord.MessageEmbed()
          .setColor('#c4302b')
          .addFields(
            { name: 'Result', value: i + 1 - ((page - 1) * 5), inline: false },
            { name: 'Title', value: results.items[i].title, inline: true },
            { name: 'Link', value: results.items[i].link, inline: true },
            { name: 'Duration', value: results.items[i].duration, inline: true },
            { name: 'Uploaded by', value: results.items[i].author.name, inline: true }
          )
          .setThumbnail(results.items[i].thumbnail)
        if (i === (page - 1) * 5) {
          newMessage.setTitle('Search Results for', results.query)
        }
        if (i === upTo - 1) {
          newMessage.setFooter('Page ' + page + ' out of ' + pages)
          request.channel.send(newMessage).then(function (message) {
            searchMessages.push(message)
            if (results.items.length > upTo && page === 1) {
              message.react('➡')
                .then(() => message.react('1️⃣'))
                .then(() => message.react('2️⃣'))
                .then(() => message.react('3️⃣'))
                .then(() => message.react('4️⃣'))
                .then(() => message.react('5️⃣'))
                .then(() => message.react('❌'))
                .then(() => searchAwaitReact())
            } else if (results.items.length > upTo && page !== 1) {
              message.react('⬅')
                .then(() => message.react('➡'))
                .then(() => message.react('1️⃣'))
                .then(() => message.react('2️⃣'))
                .then(() => message.react('3️⃣'))
                .then(() => message.react('4️⃣'))
                .then(() => message.react('5️⃣'))
                .then(() => message.react('❌'))
                .then(() => searchAwaitReact())
            } else {
              message.react('⬅')
                .then(() => message.react('1️⃣'))
                .then(() => { if (upTo >= (page - 1) * 5 + 2) { message.react('2️⃣') } })
                .then(() => { if (upTo >= (page - 1) * 5 + 3) { message.react('3️⃣') } })
                .then(() => { if (upTo >= (page - 1) * 5 + 4) { message.react('4️⃣') } })
                .then(() => { if (upTo >= (page - 1) * 5 + 5) { message.react('5️⃣') } })
                .then(() => message.react('❌'))
                .then(() => searchAwaitReact())
            }

            function searchAwaitReact () {
              displayQueue.shift()
              const filter = (reaction, user) => {
                return user.id !== message.author.id
              }

              searchMessages[searchMessages.length - 1].collector = message.createReactionCollector(filter, { max: 1, time: 60000 })

              searchMessages[searchMessages.length - 1].collector.on('collect', (reaction, user) => {
                let choice
                if (reaction.emoji.name === '1️⃣') {
                  choice = results.items[0 + (page - 1) * 5]
                } else if (reaction.emoji.name === '2️⃣') {
                  choice = results.items[1 + (page - 1) * 5]
                } else if (reaction.emoji.name === '3️⃣') {
                  choice = results.items[2 + (page - 1) * 5]
                } else if (reaction.emoji.name === '4️⃣') {
                  choice = results.items[3 + (page - 1) * 5]
                } else if (reaction.emoji.name === '5️⃣') {
                  choice = results.items[4 + (page - 1) * 5]
                } else if (reaction.emoji.name === '⬅') {
                  displayQueue.push({ type: 'search', request: request, message: page - 1 })
                } else if (reaction.emoji.name === '➡') {
                  displayQueue.push({ type: 'search', request: request, message: page + 1 })
                } else if (reaction.emoji.name === '❌') {
                  for (let i = 0; i < searchMessages.length; i++) {
                    if (!searchMessages[i].deleted) {
                      if (searchMessages[i].collector) {
                        searchMessages[i].collector.stop()
                      }
                      searchMessages[i].delete()
                    }
                  }
                }
                if (choice) {
                  for (let i = 0; i < searchMessages.length; i++) {
                    if (!searchMessages[i].deleted) {
                      if (searchMessages[i].collector) {
                        searchMessages[i].collector.stop()
                      }
                      searchMessages[i].delete()
                    }
                  }
                  if (finishSong) {
                    displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> Finish song is set to true, disable it if you\'d like to add music to the queue' })
                    return
                  } else if (finishQueue) {
                    displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> Finish queue is set to true, disable it if you\'d like to add music to the queue' })
                    return
                  }
                  choice.message = request
                  if (!connection) {
                    joinVoice(request).then(function (connected) {
                      if (connected) {
                        nowPlaying = choice
                        player(nowPlaying)
                      }
                    })
                  } else if (!nowPlaying) {
                    nowPlaying = choice
                    player(nowPlaying)
                  } else {
                    queue.push(choice)
                    displayQueue.push({ type: 'notification', request: message, message: '<@!' + results.items[0].message.author.id + '> Added ' + results.items[0].title + ' to the queue' })
                    displayQueue.push({ type: 'nowPlaying', request: message })
                  }
                }
              })
            }
          })
        } else {
          request.channel.send(newMessage).then(function (message) {
            searchMessages.push(message)
          })
        }
      }
    } else {
      displayQueue.shift()
    }
  })
}

function showQueue (newMessage, page, request) {
  newMessage.setColor('#139c9c')
  if (page > Math.ceil((autoplayQueue.length + queue.length) / 20) && page !== 1) {
    newMessage.setDescription('<@!' + request.author.id + '> The queue is only ' + Math.ceil((autoplayQueue.length + queue.length) / 20) + ' pages long')
    request.channel.send(newMessage).then(function (message) {
      sentMessages.push(message)
      setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
    })
    displayQueue.shift()
  } else {
    let queueMessage = ''
    for (let i = (page - 1) * 20; i < page * 20; i++) {
      if (i < queue.length && !finishSong) {
        queueMessage = queueMessage.concat('\n', i + 1, '. ', queue[i].title, ' [', queue[i].message.author.username + ']')
      } else if (settings.autoplay && i - queue.length < autoplayQueue.length && !finishQueue) {
        queueMessage = queueMessage.concat('\n', i + 1, '. ', autoplayQueue[i - queue.length].title, ' [autoplay]')
      }
    }
    if (queueMessage === '') {
      queueMessage = 'Nothing in Queue'
    }
    newMessage.setTitle('Queue')
      .setDescription(queueMessage)
      .setFooter('Showing page ' + page + ' of ' + Math.ceil((autoplayQueue.length + queue.length) / 20))
    const temp = request.channel.send(newMessage)
    temp.then(function (message) {
      showQueueMessage = message
      setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)

      if (page === 1 && Math.ceil((autoplayQueue.length + queue.length) / 20) > 1) {
        message.react('➡')
          .then(() => message.react('❌'))
          .then(() => showQueueMessageAwaitReact())
      } else if (page === Math.ceil((autoplayQueue.length + queue.length) / 20)) {
        message.react('⬅')
          .then(() => message.react('❌'))
          .then(() => showQueueMessageAwaitReact())
      } else if (page < Math.ceil((autoplayQueue.length + queue.length) / 20)) {
        message.react('⬅')
          .then(() => message.react('➡'))
          .then(() => message.react('❌'))
          .then(() => showQueueMessageAwaitReact())
      } else {
        displayQueue.shift()
      }

      function showQueueMessageAwaitReact () {
        displayQueue.shift()
        const filter = (reaction, user) => {
          return user.id !== message.author.id
        }

        showQueueMessage.collector = message.createReactionCollector(filter, { max: 1, time: 60000 })
        showQueueMessage.collector.on('collect', (reaction, user) => {
          if (reaction.emoji.name === '⬅') {
            displayQueue.push({ type: 'showQueue', request: request, message: page - 1 })
          } else if (reaction.emoji.name === '➡') {
            displayQueue.push({ type: 'showQueue', request: request, message: page + 1 })
          } else if (reaction.emoji.name === '❌') {
            message.delete()
          }
        })
      }
    })
  }
}

function display (type, request, message) {
  const newMessage = new Discord.MessageEmbed()
  if (type === 'error') {
    newMessage.setColor('#c93d16')
      .setDescription(message)
  } else if (type === 'notification') {
    newMessage.setColor('#7289da')
      .setDescription(message)
  } else if (type === 'nowPlaying') {
    if (!nowPlayingMessage.deleted) {
      if (nowPlayingMessage.collector) {
        nowPlayingMessage.collector.stop()
      }
      nowPlayingMessage.delete()
    }
    upDateNowPlaying(newMessage, request)
  } else if (type === 'search') {
    for (let i = 0; i < searchMessages.length; i++) {
      if (!searchMessages[i].deleted) {
        if (searchMessages[i].collector) {
          searchMessages[i].collector.stop()
        }
        searchMessages[i].delete()
      }
    }
    search(message, request)
  } else if (type === 'showQueue') {
    if (!showQueueMessage.deleted) {
      if (showQueueMessage.collector) {
        showQueueMessage.collector.stop()
      }
      showQueueMessage.delete()
    }
    showQueue(newMessage, message, request)
  } else if (type === 'stop') {
    if (!nowPlayingMessage.deleted) {
      if (nowPlayingMessage.collector) {
        nowPlayingMessage.collector.stop()
      }
      nowPlayingMessage.delete()
    }
    for (let i = 0; i < searchMessages.length; i++) {
      if (!searchMessages[i].deleted) {
        if (searchMessages[i].collector) {
          searchMessages[i].collector.stop()
        }
        searchMessages[i].delete()
      }
    }
    if (!showQueueMessage.deleted) {
      if (showQueueMessage.collector) {
        showQueueMessage.collector.stop()
      }
      showQueueMessage.delete()
    }
    setTimeout(function () {
      for (let i = 0; i < sentMessages.length; i++) {
        if (!sentMessages[i].deleted) {
          sentMessages[i].delete()
        }
      }
    }, 1000)
    paused = false
    nowPlaying = undefined
    finishSong = false
    finishQueue = false
    queue = []
    voiceChannel.leave()
    voiceChannel = undefined
    connection = undefined
    if (dispatcher) {
      dispatcher.destroy()
    }
    displayQueue.shift()
  }

  if (type !== 'nowPlaying' && type !== 'search' && type !== 'showQueue' && type !== 'stop') {
    request.channel.send(newMessage).then(function (message) {
      displayQueue.shift()
      sentMessages.push(message)
      setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
    })
  }
}

client.login(settings.token)
client.once('ready', function () {
  console.log('Ready!')
  setInterval(function () {
    if (displayQueue.length > 0 && displayQueue[0] !== lastDisplay) {
      lastDisplay = displayQueue[0]
      display(displayQueue[0].type, displayQueue[0].request, displayQueue[0].message)
    }
  }, 1)
})

client.on('message', async function (message) {
  if (message.author.bot) return
  if (!message.content.startsWith(settings.prefix)) return
  if (message.content.startsWith(settings.prefix)) {
    message.delete()
  }
  message.content = message.content.replace(settings.prefix, '')
  if (message.channel.id !== settings.channelID && settings.channelID) {
    if (message.content === 'set channel') {
      settings.channelID = message.channel.id
      displayQueue.push({ type: 'notification', request: message, message: 'Now listening to commands from <#' + settings.channelID + '>' })
      fs.writeFile('config.json', JSON.stringify(settings), (error) => { if (error) throw error })
    } else {
      displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> Please use <#' + settings.channelID + '> to send commands to this bot' })
      return
    }
  } else if (message.content === 'set channel') {
    settings.channelID = message.channel.id
    displayQueue.push({ type: 'notification', request: message, message: 'Now listening to commands from <#' + settings.channelID + '>' })
    fs.writeFile('config.json', JSON.stringify(settings), (error) => { if (error) throw error })
  }
  if (message.content === 'join') {
    joinVoice(message)
  } else if (message.content.startsWith('play ')) {
    message.content = message.content.replace('play ', '')
    if (finishSong) {
      displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> Finish song is set to true, disable it if you\'d like to add music to the queue' })
      return
    } else if (finishQueue) {
      displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> Finish queue is set to true, disable it if you\'d like to add music to the queue' })
      return
    }
    if (!connection) {
      joinVoice(message).then(function (connected) {
        if (connected) {
          searchYT(message, 1).then(function (results) {
            if (results) {
              nowPlaying = results.items[0]
              nowPlaying.message = message
              player(nowPlaying)
            }
          })
        }
      })
    } else if (!nowPlaying) {
      searchYT(message, 1).then(function (results) {
        if (results) {
          nowPlaying = results.items[0]
          nowPlaying.message = message
          player(nowPlaying)
        }
      })
    } else {
      searchYT(message, 1).then(function (results) {
        if (results) {
          results.items[0].message = message
          queue.push(results.items[0])
          displayQueue.push({ type: 'notification', request: message, message: '<@!' + results.items[0].message.author.id + '> Added ' + results.items[0].title + ' to the queue' })
          displayQueue.push({ type: 'nowPlaying', request: message })
        }
      })
    }
  } else if (message.content.startsWith('search ')) {
    displayQueue.push({ type: 'search', request: message, message: 1 })
  } else if (message.content === 'start autoplay') {
    if (!settings.autoplay) {
      displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> Autoplay is toggled off' })
    } else {
      if (!connection) {
        joinVoice(message).then(function (connected) {
          if (connected) {
            autoplayQueue[0].message = message
            playNext()
          }
        })
      } else if (!nowPlaying) {
        autoplayQueue[0].message = message
        playNext()
      } else {
        displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> Something is alreading playing' })
      }
    }
  } else if (message.content === 'pause') {
    if (!dispatcher) {
      displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> There\'s nothing to pause' })
    } else {
      dispatcher.pause()
      paused = true
      displayQueue.push({ type: 'nowPlaying', request: message })
    }
  } else if (message.content === 'resume') {
    if (!dispatcher) {
      displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> There\'s nothing to resume' })
    } else {
      dispatcher.resume()
      paused = false
      displayQueue.push({ type: 'nowPlaying', request: message })
    }
  } else if (message.content === 'skip' || message.content === 'next') {
    if (!dispatcher) {
      displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> There\'s nothing to skip' })
    } else {
      playNext()
    }
  } else if (message.content === 'stop' || message.content === 'commit seppuku') {
    displayQueue.push({ type: 'stop' })
  } else if (message.content.startsWith('remove ')) {
    let found = false
    searchYT(message, 1).then(function (results) {
      for (let i = 0; i < queue.length; i++) {
        if (queue[i].link === results.items[0].link && !found) {
          queue.splice(i, 1)
          found = true
        }
      }
      if (!found) {
        displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> Couldn\'t find "' + message.content.replace('remove', '') + '" in the queue' })
      } else {
        displayQueue.push({ type: 'notification', request: message, message: '<@!' + message.author.id + '> Removed "' + results.items[0].title + '" from the queue' })
        displayQueue.push({ type: 'nowPlaying', request: message })
      }
    })
  } else if (message.content.startsWith('advance ')) {
    message.content = message.content.replace('advance ', '')
    const index = parseInt(message.content)
    if (!index) {
      displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> That was not an integer' })
    } else if (index > queue.length + autoplayQueue.length) {
      displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> The queue is not that long' })
    } else {
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
      displayQueue.push({ type: 'nowPlaying', request: message })
    }
  } else if (message.content === 'show queue') {
    displayQueue.push({ type: 'showQueue', request: message, message: 1 })
  } else if (message.content.startsWith('show queue ')) {
    const page = parseInt(message.content.replace('show queue ', ''))
    if (!page) {
      displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> That was not an integer' })
    } else {
      displayQueue.push({ type: 'showQueue', request: message, message: page })
    }
  } else if (message.content === 'clear queue') {
    queue = []
    displayQueue.push({ type: 'notification', request: message, message: '<@!' + message.author.id + '> Cleared the queue' })
    displayQueue.push({ type: 'nowPlaying', request: message })
  } else if (message.content === 'toggle autoplay') {
    settings.autoplay = !settings.autoplay
    displayQueue.push({ type: 'notification', request: message, message: '<@!' + message.author.id + '> Set autoplay to ' + settings.autoplay })
    if (settings.autoplay) {
      autoplayInit().then(function () {
        displayQueue.push({ type: 'nowPlaying', request: message })
      })
    } else {
      autoplayQueue = []
    }
  } else if (message.content === 'toggle finish song') {
    finishSong = !finishSong
    displayQueue.push({ type: 'notification', request: message, message: '<@!' + message.author.id + '> Set finish song to ' + finishSong })
    displayQueue.push({ type: 'nowPlaying', request: message })
  } else if (message.content === 'toggle finish queue') {
    finishQueue = !finishQueue
    displayQueue.push({ type: 'notification', request: message, message: '<@!' + message.author.id + '> Set finish song to ' + finishQueue })
    displayQueue.push({ type: 'nowPlaying', request: message })
  } else if (message.content === 'help') {
    const newMessage = new Discord.MessageEmbed()
      .setColor('#7289da')
      .setTitle('Avaiable Commands')
      .setDescription('**"' + settings.prefix + 'join"**\nBot joins the voice channel the user is in.\n\n' +
      '**"' + settings.prefix + 'play [youtube query]"**\nBot will play the first result from youtube to the voice channel it is in.' + ' If something is already playing, it will add it to the queue.\n\n' +
      '**"' + settings.prefix + 'search [youtube query]"**\nBot will search youtube for the first 15 results and user can choose which one to play using the reaction emotes.\n\n' +
      '**"' + settings.prefix + 'start autoplay"**\nBot will begin playing from the autoplay folder if autoplay is enabled.\n\n' +
      '**"' + settings.prefix + 'pause"**\nPauses what the bot is playing.\n\n' +
      '**"' + settings.prefix + 'resume"**\nResumes what was paused.\n\n' +
      '**"' + settings.prefix + 'skip" or "' + settings.prefix + 'next"**\nSkips the current song and moves onto the next song in the queue.\n\n' +
      '**"' + settings.prefix + 'remove [youtube query]"**\nSearches youtube and removes the first thing in the queue that matches the first search result.\n\n' +
      '**"' + settings.prefix + 'advance [queue index]"**\nMoves the corresponding song in the queue to the top.\n\n' +
      '**"' + settings.prefix + 'clear queue"**\nBot will clear the current queue.\n\n' +
      '**"' + settings.prefix + 'stop"**\nImmediately stops playing, clears the queue, and leaves the voice channel.\n\n' +
      '**"' + settings.prefix + 'toggle finish song"**\nToggles whether or not the bot will finish playing the current song then leave. New requests will not be honored when true.\n\n' +
      '**"' + settings.prefix + 'toggle finish queue"**\nToggles whether or not the bot will finish playing the queue then leave. New requests will not be honored when true.\n\n' +
      '**"' + settings.prefix + 'toggle autoplay"**\nToggles whether or not bot will play songs from the autoplay folder when queue is empty. When disabled, bot will automatically leave after 60 seconds when queue is empty.\n\n' +
      '**"' + settings.prefix + 'set channel"**\nBot sets the channel the bot will listen to. Bot will notify users if they try to user a different channel.\n\n' +
      '**"' + settings.prefix + 'clear channel [x]"**\nBot will delete that last x messages in the channel. Note that you can only delete messages less than 14 days old.')
    client.users.cache.get(message.author.id).send(newMessage)
  } else if (message.content.startsWith('clear channel ')) {
    message.content = message.content.replace('clear channel ', '')
    const number = parseInt(message.content)
    if (!number) {
      displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> That was not an integer' })
    } else if (number > 100) {
      displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> You can only delete up to 100 messages at a time' })
    } else {
      message.channel.bulkDelete(number).then(() => {
        displayQueue.push({ type: 'notification', request: message, message: '<@!' + message.author.id + '> Deleted ' + number + ' messages' })
      })
    }
  } else {
    displayQueue.push({ type: 'error', request: message, message: '<@!' + message.author.id + '> That is not a valid command. Type "' + settings.prefix + 'help" to show the list of avaliable commands.' })
  }
})
