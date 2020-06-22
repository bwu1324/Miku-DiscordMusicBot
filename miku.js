const Discord = require('discord.js')
const ytdl = require('ytdl-core')
const ytsr = require('ytsr')
const fs = require('fs')
const mm = require('music-metadata')
const client = new Discord.Client()

var settings = require('./config.json')

var queue = []
var autoplayQueue = []
var sentMessages = []
var lastCommand

var nowPlaying
var nowPlayingMessage = []
var showQueueMessage = []
var ytSearchMessage = []
var finishSong = false
var finishQueue = false

var voiceChannel
var connection
var dispatcher

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
        metadata.fileName = files[index]
        autoplayQueue.push(metadata)
        index++
        if (index < files.length) {
          meta()
        }
      }).catch(console.error)
    }
  })
}
if (settings.autoplay) {
  autoplayInit()
}

async function joinVoice (message) {
  voiceChannel = message.member.voice.channel

  if (!voiceChannel) {
    const newMessage = new Discord.MessageEmbed()
      .setColor('#7289da')
      .setDescription('<@!' + message.author.id + '> Please join a voice channel to play music')
    message.channel.send(newMessage).then(function (message) {
      sentMessages.push(message)
      setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
    }).catch(console.error)
  } else {
    const newConnection = voiceChannel.join()
    newConnection.then(async function () {
      const newMessage = new Discord.MessageEmbed()
        .setColor('#7289da')
        .setDescription('Joined <@!' + message.author.id + '> in the voice channel named ' + voiceChannel.name)
      message.channel.send(newMessage).then(function (message) {
        sentMessages.push(message)
        setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
      }).catch(console.error)
    }).catch(console.error)

    connection = await newConnection
  }
}

async function upDateNowPlaying (paused) {
  let newMessage
  if (!nowPlaying) {
    newMessage = new Discord.MessageEmbed()
      .setColor('#7289da')
      .setTitle('Not Playing')
      .addFields(
        { name: 'Autoplay', value: settings.autoplay, inline: true },
        { name: 'Finish song', value: finishSong, inline: true },
        { name: 'Finish queue', value: finishQueue, inline: true }
      )
    for (let i = 0; i < nowPlayingMessage.length; i++) {
      if (!nowPlayingMessage[i].deleted) {
        nowPlayingMessage[i].delete()
      }
    }
    const temp = lastCommand.channel.send(newMessage)
    temp.then(function (message) { sentMessages.push(message) }).catch(console.error)
    nowPlayingMessage.push(await temp)
  } else if (!nowPlaying.fileName) {
    let status = 'Now Playing - '
    if (paused) {
      status = '[PAUSED] - '
    }
    let queueMessage = ''
    for (let i = 0; i < 5; i++) {
      if (i < queue.length && !finishSong) {
        queueMessage = queueMessage.concat('\n', i + 1, '. ', queue[i].title, ' [', queue[i].message.author.username + ']')
      } else if (settings.autoplay && i - queue.length < autoplayQueue.length && !finishQueue && !finishSong) {
        queueMessage = queueMessage.concat('\n', i + 1, '. ', autoplayQueue[i - queue.length].common.title, ' [autoplay]')
      }
    }

    if (queueMessage === '') {
      queueMessage = 'Nothing in Queue'
    }
    for (let i = 0; i < nowPlayingMessage.length; i++) {
      if (!nowPlayingMessage[i].deleted) {
        nowPlayingMessage[i].delete()
      }
    }
    const newMessage = new Discord.MessageEmbed()
      .setColor('#7289da')
      .setTitle(status + nowPlaying.title)
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

    const temp = nowPlaying.message.channel.send(newMessage)
    temp.then(function (message) {
      sentMessages.push(message)
      if (status.startsWith('[PAUSED]')) {
        message.react('▶')
          .then(() => message.react('⏹'))
          .then(() => message.react('⏭'))
          .then(function () {
            const filter = (reaction, user) => {
              return user.id !== message.author.id
            }

            const collector = message.createReactionCollector(filter, { max: 1 })

            collector.on('collect', (reaction, user) => {
              if (reaction.emoji.name === '▶') {
                dispatcher.resume()
                upDateNowPlaying()
              } else if (reaction.emoji.name === '⏸') {
                dispatcher.pause(true)
                upDateNowPlaying(true)
              } else if (reaction.emoji.name === '⏭') {
                playNext()
              } else if (reaction.emoji.name === '⏹') {
                if (voiceChannel) {
                  voiceChannel.leave()
                }
                if (dispatcher) {
                  dispatcher.destroy()
                  dispatcher = undefined
                }

                for (let i = 0; i < sentMessages.length; i++) {
                  if (!sentMessages[i].deleted) {
                    sentMessages[i].delete()
                  }
                }
                for (let i = 0; i < ytSearchMessage.length; i++) {
                  if (!ytSearchMessage[i].deleted) {
                    for (let j = 0; j < ytSearchMessage[i].length; j++) {
                      if (!ytSearchMessage[i][j].deleted) {
                        ytSearchMessage[i][j].delete()
                      }
                    }
                    ytSearchMessage[i].deleted = true
                  }
                }
                for (let i = 0; i < showQueueMessage.length; i++) {
                  if (!showQueueMessage[i].deleted) {
                    showQueueMessage[i].delete()
                  }
                }

                nowPlaying = undefined
                connection = undefined
                finishSong = false
                finishQueue = false
                voiceChannel = undefined
                queue = []
                sentMessages = []
              }
            })
          })
          .catch(console.error)
      } else {
        message.react('⏸')
          .then(() => message.react('⏹'))
          .then(() => message.react('⏭'))
          .then(function () {
            const filter = (reaction, user) => {
              return user.id !== message.author.id
            }

            const collector = message.createReactionCollector(filter, { max: 1 })

            collector.on('collect', (reaction, user) => {
              if (reaction.emoji.name === '▶') {
                dispatcher.resume()
                upDateNowPlaying()
              } else if (reaction.emoji.name === '⏸') {
                dispatcher.pause(true)
                upDateNowPlaying(true)
              } else if (reaction.emoji.name === '⏭') {
                playNext()
              } else if (reaction.emoji.name === '⏹') {
                if (voiceChannel) {
                  voiceChannel.leave()
                }
                if (dispatcher) {
                  dispatcher.destroy()
                  dispatcher = undefined
                }

                for (let i = 0; i < sentMessages.length; i++) {
                  if (!sentMessages[i].deleted) {
                    sentMessages[i].delete()
                  }
                }
                for (let i = 0; i < ytSearchMessage.length; i++) {
                  if (!ytSearchMessage[i].deleted) {
                    for (let j = 0; j < ytSearchMessage[i].length; j++) {
                      if (!ytSearchMessage[i][j].deleted) {
                        ytSearchMessage[i][j].delete()
                      }
                    }
                    ytSearchMessage[i].deleted = true
                  }
                }
                for (let i = 0; i < showQueueMessage.length; i++) {
                  if (!showQueueMessage[i].deleted) {
                    showQueueMessage[i].delete()
                  }
                }

                nowPlaying = undefined
                connection = undefined
                finishSong = false
                finishQueue = false
                voiceChannel = undefined
                queue = []
                sentMessages = []
              }
            })
          })
          .catch(console.error)
      }
    }).catch(console.error)
    nowPlayingMessage.push(await temp)
  } else {
    let status = 'Now Playing - '
    if (paused) {
      status = '[PAUSED] - '
    }
    let queueMessage = ''
    for (let i = 0; i < 5; i++) {
      if (i < queue.length && !finishSong) {
        queueMessage = queueMessage.concat('\n', i + 1, '. ', queue[i].title, ' [', queue[i].message.author.username + ']')
      } else if (settings.autoplay && i - queue.length < autoplayQueue.length && !finishQueue) {
        queueMessage = queueMessage.concat('\n', i + 1, '. ', autoplayQueue[i - queue.length].common.title, ' [autoplay]')
      }
    }
    if (queueMessage === '') {
      queueMessage = 'Nothing in Queue'
    }
    for (let i = 0; i < nowPlayingMessage.length; i++) {
      if (!nowPlayingMessage[i].deleted) {
        nowPlayingMessage[i].delete()
      }
    }
    const min = Math.floor(Math.floor(nowPlaying.format.duration) / 60)
    var sec
    if (Math.floor(nowPlaying.format.duration) % 60 < 10) {
      sec = '0' + Math.floor(nowPlaying.format.duration) % 60
    } else {
      sec = Math.floor(nowPlaying.format.duration) % 60
    }
    const duration = min + ':' + sec
    const newMessage = new Discord.MessageEmbed()
      .setColor('#7289da')
      .setTitle(status + nowPlaying.common.title)
      .addFields(
        { name: 'Requested by', value: 'Autoplay', inline: true },
        { name: 'Duration', value: duration, inline: true },
        { name: 'Artist', value: nowPlaying.common.artist, inline: true },
        { name: 'Queue:', value: queueMessage },
        { name: 'Autoplay', value: settings.autoplay, inline: true },
        { name: 'Finish song', value: finishSong, inline: true },
        { name: 'Finish queue', value: finishQueue, inline: true }
      )

    const temp = lastCommand.channel.send(newMessage)
    temp.then(function (message) {
      sentMessages.push(message)
      if (status.startsWith('[PAUSED]')) {
        message.react('▶')
          .then(() => message.react('⏹'))
          .then(() => message.react('⏭'))
          .then(function () {
            const filter = (reaction, user) => {
              return user.id !== message.author.id
            }

            const collector = message.createReactionCollector(filter, { max: 1 })

            collector.on('collect', (reaction, user) => {
              if (reaction.emoji.name === '▶') {
                dispatcher.resume()
                upDateNowPlaying()
              } else if (reaction.emoji.name === '⏸') {
                dispatcher.pause(true)
                upDateNowPlaying(true)
              } else if (reaction.emoji.name === '⏭') {
                playNext()
              } else if (reaction.emoji.name === '⏹') {
                if (voiceChannel) {
                  voiceChannel.leave()
                }
                if (dispatcher) {
                  dispatcher.destroy()
                  dispatcher = undefined
                }

                for (let i = 0; i < sentMessages.length; i++) {
                  if (!sentMessages[i].deleted) {
                    sentMessages[i].delete()
                  }
                }
                for (let i = 0; i < ytSearchMessage.length; i++) {
                  if (!ytSearchMessage[i].deleted) {
                    for (let j = 0; j < ytSearchMessage[i].length; j++) {
                      if (!ytSearchMessage[i][j].deleted) {
                        ytSearchMessage[i][j].delete()
                      }
                    }
                    ytSearchMessage[i].deleted = true
                  }
                }
                for (let i = 0; i < showQueueMessage.length; i++) {
                  if (!showQueueMessage[i].deleted) {
                    showQueueMessage[i].delete()
                  }
                }

                nowPlaying = undefined
                connection = undefined
                finishSong = false
                finishQueue = false
                voiceChannel = undefined
                queue = []
                sentMessages = []
              }
            })
          })
          .catch(console.error)
      } else {
        message.react('⏸')
          .then(() => message.react('⏹'))
          .then(() => message.react('⏭'))
          .then(function () {
            const filter = (reaction, user) => {
              return user.id !== message.author.id
            }

            const collector = message.createReactionCollector(filter, { max: 1 })

            collector.on('collect', (reaction, user) => {
              if (reaction.emoji.name === '▶') {
                dispatcher.resume()
                upDateNowPlaying()
              } else if (reaction.emoji.name === '⏸') {
                dispatcher.pause(true)
                upDateNowPlaying(true)
              } else if (reaction.emoji.name === '⏭') {
                playNext()
              } else if (reaction.emoji.name === '⏹') {
                if (voiceChannel) {
                  voiceChannel.leave()
                }
                if (dispatcher) {
                  dispatcher.destroy()
                  dispatcher = undefined
                }

                for (let i = 0; i < sentMessages.length; i++) {
                  if (!sentMessages[i].deleted) {
                    sentMessages[i].delete()
                  }
                }
                for (let i = 0; i < ytSearchMessage.length; i++) {
                  if (!ytSearchMessage[i].deleted) {
                    for (let j = 0; j < ytSearchMessage[i].length; j++) {
                      if (!ytSearchMessage[i][j].deleted) {
                        ytSearchMessage[i][j].delete()
                      }
                    }
                    ytSearchMessage[i].deleted = true
                  }
                }
                for (let i = 0; i < showQueueMessage.length; i++) {
                  if (!showQueueMessage[i].deleted) {
                    showQueueMessage[i].delete()
                  }
                }

                nowPlaying = undefined
                connection = undefined
                finishSong = false
                finishQueue = false
                voiceChannel = undefined
                queue = []
                sentMessages = []
              }
            })
          })
          .catch(console.error)
      }
    }).catch(console.error)
    nowPlayingMessage.push(await temp)
  }
}

function addYTQueue (message) {
  if (finishQueue) {
    const newMessage = new Discord.MessageEmbed()
      .setColor('#7289da')
      .setDescription('<@!' + message.author.id + '> Finish queue is set to true, disable it if you\'d like to add music to the queue')
    message.channel.send(newMessage).then(function (message) {
      sentMessages.push(message)
      setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
    }).catch(console.error)
    return
  } else if (finishSong) {
    const newMessage = new Discord.MessageEmbed()
      .setColor('#7289da')
      .setDescription('<@!' + message.author.id + '> Finish song is set to true, disable it if you\'d like to add music to the queue')
    message.channel.send(newMessage).then(function (message) {
      sentMessages.push(message)
      setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
    }).catch(console.error)
    return
  }
  ytsr.getFilters(message.content.replace(settings.prefix + 'play ', ''), function (err, filters) {
    if (err) throw err
    var filter = filters.get('Type').find(o => o.name === 'Video')
    ytsr.getFilters(filter.ref, function (err, filters) {
      if (err) throw err
      var options = {
        limit: 1,
        nextpageRef: filter.ref
      }
      ytsr(null, options, async function (err, searchResults) {
        if (err) throw err

        searchResults.items[0].message = message
        queue.push(searchResults.items[0])

        const newMessage = new Discord.MessageEmbed()
          .setColor('#7289da')
          .setDescription('<@!' + message.author.id + '> added ' + searchResults.items[0].title + ' to the queue')
        message.channel.send(newMessage).then(function (message) {
          sentMessages.push(message)
          setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
        }).catch(console.error)

        upDateNowPlaying()
      })
    })
  })
}

function YTPlay (play) {
  dispatcher = connection.play(ytdl(play.link, { filter: 'audioonly', highWaterMark: 1 << 25 }))

  dispatcher.on('start', function () {
    upDateNowPlaying()
    console.log('Started playing ' + play.title)
  })

  dispatcher.on('finish', () => {
    nowPlaying = undefined
    dispatcher.destroy()
    console.log('Finished playing ' + play.title)
    playNext()
  })
}

function autoPlay (play) {
  dispatcher = connection.play('./autoplay/' + play.fileName)

  dispatcher.on('start', function () {
    upDateNowPlaying()
    console.log('Started playing ' + play.common.title)
  })

  dispatcher.on('finish', () => {
    nowPlaying = undefined
    dispatcher.destroy()
    console.log('Finished playing ' + play.common.title)
    playNext()
  })
}

function playNext () {
  nowPlaying = undefined
  if (queue.length > 0) {
    nowPlaying = queue[0]
    queue.shift()

    if (finishSong) {
      if (voiceChannel) {
        voiceChannel.leave()
      }
      if (dispatcher) {
        dispatcher.destroy()
        dispatcher = undefined
      }

      for (let i = 0; i < sentMessages.length; i++) {
        if (!sentMessages[i].deleted) {
          sentMessages[i].delete()
        }
      }
      for (let i = 0; i < ytSearchMessage.length; i++) {
        if (!ytSearchMessage[i].deleted) {
          for (let j = 0; j < ytSearchMessage[i].length; j++) {
            if (!ytSearchMessage[i][j].deleted) {
              ytSearchMessage[i][j].delete()
            }
          }
          ytSearchMessage[i].deleted = true
        }
      }
      for (let i = 0; i < showQueueMessage.length; i++) {
        if (!showQueueMessage[i].deleted) {
          showQueueMessage[i].delete()
        }
      }

      nowPlaying = undefined
      connection = undefined
      finishSong = false
      finishQueue = false
      voiceChannel = undefined
      queue = []
      sentMessages = []
    } else {
      YTPlay(nowPlaying)
    }
  } else if (queue.length === 0) {
    if (finishSong) {
      if (voiceChannel) {
        voiceChannel.leave()
      }
      if (dispatcher) {
        dispatcher.destroy()
        dispatcher = undefined
      }

      for (let i = 0; i < sentMessages.length; i++) {
        if (!sentMessages[i].deleted) {
          sentMessages[i].delete()
        }
      }
      for (let i = 0; i < ytSearchMessage.length; i++) {
        if (!ytSearchMessage[i].deleted) {
          for (let j = 0; j < ytSearchMessage[i].length; j++) {
            if (!ytSearchMessage[i][j].deleted) {
              ytSearchMessage[i][j].delete()
            }
          }
          ytSearchMessage[i].deleted = true
        }
      }
      for (let i = 0; i < showQueueMessage.length; i++) {
        if (!showQueueMessage[i].deleted) {
          showQueueMessage[i].delete()
        }
      }

      nowPlaying = undefined
      connection = undefined
      finishSong = false
      finishQueue = false
      voiceChannel = undefined
      queue = []
      sentMessages = []
    } else if (finishQueue) {
      if (voiceChannel) {
        voiceChannel.leave()
      }
      if (dispatcher) {
        dispatcher.destroy()
        dispatcher = undefined
      }

      for (let i = 0; i < sentMessages.length; i++) {
        if (!sentMessages[i].deleted) {
          sentMessages[i].delete()
        }
      }
      for (let i = 0; i < ytSearchMessage.length; i++) {
        if (!ytSearchMessage[i].deleted) {
          for (let j = 0; j < ytSearchMessage[i].length; j++) {
            if (!ytSearchMessage[i][j].deleted) {
              ytSearchMessage[i][j].delete()
            }
          }
          ytSearchMessage[i].deleted = true
        }
      }
      for (let i = 0; i < showQueueMessage.length; i++) {
        if (!showQueueMessage[i].deleted) {
          showQueueMessage[i].delete()
        }
      }

      nowPlaying = undefined
      connection = undefined
      finishSong = false
      finishQueue = false
      voiceChannel = undefined
      queue = []
      sentMessages = []
    } else if (settings.autoplay) {
      nowPlaying = autoplayQueue[0]
      autoplayQueue.shift()
      autoPlay(nowPlaying)
      if (autoplayQueue.length < 6) {
        autoplayInit()
      }
    } else {
      upDateNowPlaying()
      const newMessage = new Discord.MessageEmbed()
        .setColor('#7289da')
        .setDescription('Nothing to play, leaving voice channel in 60 seconds')
      lastCommand.channel.send(newMessage).then(function (message) {
        sentMessages.push(message)

        setTimeout(function () {
          if (!nowPlaying) {
            if (voiceChannel) {
              voiceChannel.leave()
              voiceChannel = undefined
              connection = undefined
              finishSong = false
            }
            if (dispatcher) {
              dispatcher.destroy()
              dispatcher = undefined
            }

            for (let i = 0; i < sentMessages.length; i++) {
              if (!sentMessages[i].deleted) {
                sentMessages[i].delete()
              }
            }
            for (let i = 0; i < ytSearchMessage.length; i++) {
              if (!ytSearchMessage[i].deleted) {
                for (let j = 0; j < ytSearchMessage[i].length; j++) {
                  if (!ytSearchMessage[i][j].deleted) {
                    ytSearchMessage[i][j].delete()
                  }
                }
                ytSearchMessage[i].deleted = true
              }
            }
            for (let i = 0; i < showQueueMessage.length; i++) {
              if (!showQueueMessage[i].deleted) {
                showQueueMessage[i].delete()
              }
            }

            queue = []
            sentMessages = []
          } else {
            if (!message.deleted) {
              message.delete()
            }
          }
        }, 60000)
      }).catch(console.error)
    }
  }
}

function ytSearch (search, page) {
  for (let i = 0; i < ytSearchMessage.length; i++) {
    if (!ytSearchMessage[i].deleted) {
      for (let j = 0; j < ytSearchMessage[i].length; j++) {
        if (!ytSearchMessage[i][j].deleted) {
          ytSearchMessage[i][j].delete()
        }
      }
      ytSearchMessage[i].deleted = true
    }
  }
  ytsr.getFilters(search.content.replace(settings.prefix + 'search ', ''), function (err, filters) {
    if (err) throw err
    var filter = filters.get('Type').find(o => o.name === 'Video')
    ytsr.getFilters(filter.ref, function (err, filters) {
      if (err) throw err
      var options = {
        limit: 15,
        nextpageRef: filter.ref
      }
      ytsr(null, options, async function (err, searchResults) {
        if (err) throw err
        const resultsMessage = []
        const newMessage1 = new Discord.MessageEmbed()
          .setColor('#7289da')
          .setTitle('Search Results for "' + searchResults.query + '"')
          .setThumbnail(searchResults.items[(page - 1) * 5].thumbnail)
          .addFields(
            { name: 'Result', value: 1, inline: false },
            { name: 'Title', value: searchResults.items[(page - 1) * 5].title, inline: true },
            { name: 'Link', value: searchResults.items[(page - 1) * 5].link, inline: true },
            { name: 'Duration', value: searchResults.items[(page - 1) * 5].duration, inline: true },
            { name: 'Uploaded by', value: searchResults.items[(page - 1) * 5].author.name, inline: true }
          )
        search.channel.send(newMessage1).then(function (message) {
          resultsMessage.push(message)
        }).catch(console.error)

        for (let i = 1; i < 4; i++) {
          const newMessage2 = new Discord.MessageEmbed()
            .setColor('#7289da')
            .setThumbnail(searchResults.items[i + (page - 1) * 5].thumbnail)
            .addFields(
              { name: 'Result', value: i + 1, inline: false },
              { name: 'Title', value: searchResults.items[i + (page - 1) * 5].title, inline: true },
              { name: 'Link', value: searchResults.items[i + (page - 1) * 5].link, inline: true },
              { name: 'Duration', value: searchResults.items[i + (page - 1) * 5].duration, inline: true },
              { name: 'Uploaded by', value: searchResults.items[i + (page - 1) * 5].author.name, inline: true }
            )
          search.channel.send(newMessage2).then(function (message) {
            resultsMessage.push(message)
          }).catch(console.error)
        }

        const newMessage3 = new Discord.MessageEmbed()
          .setColor('#7289da')
          .setThumbnail(searchResults.items[4 + (page - 1) * 5].thumbnail)
          .addFields(
            { name: 'Result', value: 5, inline: false },
            { name: 'Title', value: searchResults.items[4 + (page - 1) * 5].title, inline: true },
            { name: 'Link', value: searchResults.items[4 + (page - 1) * 5].link, inline: true },
            { name: 'Duration', value: searchResults.items[4 + (page - 1) * 5].duration, inline: true },
            { name: 'Uploaded by', value: searchResults.items[4 + (page - 1) * 5].author.name, inline: true }
          )
          .setFooter('Showing page ' + page + ' of 3')
        const temp = search.channel.send(newMessage3)
        temp.then(function (message) {
          resultsMessage.push(message)
        }).catch(console.error)
        ytSearchMessage.push(resultsMessage)
        const last = await temp

        if (page === 1) {
          last.react('➡')
            .then(() => last.react('1️⃣'))
            .then(() => last.react('2️⃣'))
            .then(() => last.react('3️⃣'))
            .then(() => last.react('4️⃣'))
            .then(() => last.react('5️⃣'))
            .then(() => last.react('❌'))
            .then(function () {
              const filter = (reaction, user) => {
                return user.id !== last.author.id
              }

              const collector = last.createReactionCollector(filter, { max: 1, time: 60000 })

              collector.on('collect', (reaction, user) => {
                let choice
                if (reaction.emoji.name === '1️⃣') {
                  choice = searchResults.items[0 + (page - 1) * 5]
                } else if (reaction.emoji.name === '2️⃣') {
                  choice = searchResults.items[1 + (page - 1) * 5]
                } else if (reaction.emoji.name === '3️⃣') {
                  choice = searchResults.items[2 + (page - 1) * 5]
                } else if (reaction.emoji.name === '4️⃣') {
                  choice = searchResults.items[3 + (page - 1) * 5]
                } else if (reaction.emoji.name === '5️⃣') {
                  choice = searchResults.items[4 + (page - 1) * 5]
                } else if (reaction.emoji.name === '⬅') {
                  ytSearch(search, page - 1)
                } else if (reaction.emoji.name === '➡') {
                  ytSearch(search, page + 1)
                } else if (reaction.emoji.name === '❌') {
                  for (let i = 0; i < resultsMessage.length; i++) {
                    if (!resultsMessage[i].deleted) {
                      resultsMessage[i].delete()
                    }
                  }
                }
                if (choice) {
                  for (let i = 0; i < resultsMessage.length; i++) {
                    if (!resultsMessage[i].deleted) {
                      resultsMessage[i].delete()
                    }
                  }

                  if (!connection && !finishQueue) {
                    joinVoice(search).then(function () {
                      if (connection) {
                        if (queue.length === 0 && !nowPlaying) {
                          nowPlaying = choice
                          nowPlaying.message = search
                          YTPlay(nowPlaying)
                        } else {
                          if (finishQueue) {
                            const newMessage = new Discord.MessageEmbed()
                              .setColor('#7289da')
                              .setDescription('<@!' + search.author.id + '> Finish queue is set to true, disable it if you\'d like to add music to the queue')
                            search.channel.send(newMessage).then(function (message) {
                              sentMessages.push(message)
                              setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                            }).catch(console.error)
                          } else if (finishSong) {
                            const newMessage = new Discord.MessageEmbed()
                              .setColor('#7289da')
                              .setDescription('<@!' + search.author.id + '> Finish song is set to true, disable it if you\'d like to add music to the queue')
                            search.channel.send(newMessage).then(function (message) {
                              sentMessages.push(message)
                              setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                            }).catch(console.error)
                          } else {
                            search.content = settings.prefix + 'play ' + choice.link
                            addYTQueue(search)
                          }
                        }
                      }
                    })
                  } else if (queue.length === 0 && !nowPlaying) {
                    nowPlaying = choice
                    nowPlaying.message = search
                    YTPlay(nowPlaying)
                  } else {
                    if (finishQueue) {
                      const newMessage = new Discord.MessageEmbed()
                        .setColor('#7289da')
                        .setDescription('<@!' + search.author.id + '> Finish queue is set to true, disable it if you\'d like to add music to the queue')
                      search.channel.send(newMessage).then(function (message) {
                        sentMessages.push(message)
                        setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                      }).catch(console.error)
                    } else if (finishSong) {
                      const newMessage = new Discord.MessageEmbed()
                        .setColor('#7289da')
                        .setDescription('<@!' + search.author.id + '> Finish song is set to true, disable it if you\'d like to add music to the queue')
                      search.channel.send(newMessage).then(function (message) {
                        sentMessages.push(message)
                        setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                      }).catch(console.error)
                    } else {
                      search.content = settings.prefix + 'play ' + choice.link
                      addYTQueue(search)
                    }
                  }
                }
              })
            })
            .catch(console.error)
        } else if (page === 2) {
          last.react('⬅')
            .then(() => last.react('➡'))
            .then(() => last.react('1️⃣'))
            .then(() => last.react('2️⃣'))
            .then(() => last.react('3️⃣'))
            .then(() => last.react('4️⃣'))
            .then(() => last.react('5️⃣'))
            .then(() => last.react('❌'))
            .then(function () {
              const filter = (reaction, user) => {
                return user.id !== last.author.id
              }

              const collector = last.createReactionCollector(filter, { max: 1, time: 60000 })

              collector.on('collect', (reaction, user) => {
                let choice
                if (reaction.emoji.name === '1️⃣') {
                  choice = searchResults.items[0 + (page - 1) * 5]
                } else if (reaction.emoji.name === '2️⃣') {
                  choice = searchResults.items[1 + (page - 1) * 5]
                } else if (reaction.emoji.name === '3️⃣') {
                  choice = searchResults.items[2 + (page - 1) * 5]
                } else if (reaction.emoji.name === '4️⃣') {
                  choice = searchResults.items[3 + (page - 1) * 5]
                } else if (reaction.emoji.name === '5️⃣') {
                  choice = searchResults.items[4 + (page - 1) * 5]
                } else if (reaction.emoji.name === '⬅') {
                  ytSearch(search, page - 1)
                } else if (reaction.emoji.name === '➡') {
                  ytSearch(search, page + 1)
                } else if (reaction.emoji.name === '❌') {
                  for (let i = 0; i < resultsMessage.length; i++) {
                    if (!resultsMessage[i].deleted) {
                      resultsMessage[i].delete()
                    }
                  }
                }
                if (choice) {
                  for (let i = 0; i < resultsMessage.length; i++) {
                    if (!resultsMessage[i].deleted) {
                      resultsMessage[i].delete()
                    }
                  }

                  if (!connection && !finishQueue) {
                    joinVoice(search).then(function () {
                      if (connection) {
                        if (queue.length === 0 && !nowPlaying) {
                          nowPlaying = choice
                          nowPlaying.message = search
                          YTPlay(nowPlaying)
                        } else {
                          if (finishQueue) {
                            const newMessage = new Discord.MessageEmbed()
                              .setColor('#7289da')
                              .setDescription('<@!' + search.author.id + '> Finish queue is set to true, disable it if you\'d like to add music to the queue')
                            search.channel.send(newMessage).then(function (message) {
                              sentMessages.push(message)
                              setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                            }).catch(console.error)
                          } else if (finishSong) {
                            const newMessage = new Discord.MessageEmbed()
                              .setColor('#7289da')
                              .setDescription('<@!' + search.author.id + '> Finish song is set to true, disable it if you\'d like to add music to the queue')
                            search.channel.send(newMessage).then(function (message) {
                              sentMessages.push(message)
                              setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                            }).catch(console.error)
                          } else {
                            search.content = settings.prefix + 'play ' + choice.link
                            addYTQueue(search)
                          }
                        }
                      }
                    })
                  } else if (queue.length === 0 && !nowPlaying) {
                    nowPlaying = choice
                    nowPlaying.message = search
                    YTPlay(nowPlaying)
                  } else {
                    if (finishQueue) {
                      const newMessage = new Discord.MessageEmbed()
                        .setColor('#7289da')
                        .setDescription('<@!' + search.author.id + '> Finish queue is set to true, disable it if you\'d like to add music to the queue')
                      search.channel.send(newMessage).then(function (message) {
                        sentMessages.push(message)
                        setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                      }).catch(console.error)
                    } else if (finishSong) {
                      const newMessage = new Discord.MessageEmbed()
                        .setColor('#7289da')
                        .setDescription('<@!' + search.author.id + '> Finish song is set to true, disable it if you\'d like to add music to the queue')
                      search.channel.send(newMessage).then(function (message) {
                        sentMessages.push(message)
                        setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                      }).catch(console.error)
                    } else {
                      search.content = settings.prefix + 'play ' + choice.link
                      addYTQueue(search)
                    }
                  }
                }
              })
            })
            .catch(console.error)
        } else if (page === 3) {
          last.react('⬅')
            .then(() => last.react('1️⃣'))
            .then(() => last.react('2️⃣'))
            .then(() => last.react('3️⃣'))
            .then(() => last.react('4️⃣'))
            .then(() => last.react('5️⃣'))
            .then(() => last.react('❌'))
            .then(function () {
              const filter = (reaction, user) => {
                return user.id !== last.author.id
              }

              const collector = last.createReactionCollector(filter, { max: 1, time: 60000 })

              collector.on('collect', (reaction, user) => {
                let choice
                if (reaction.emoji.name === '1️⃣') {
                  choice = searchResults.items[0 + (page - 1) * 5]
                } else if (reaction.emoji.name === '2️⃣') {
                  choice = searchResults.items[1 + (page - 1) * 5]
                } else if (reaction.emoji.name === '3️⃣') {
                  choice = searchResults.items[2 + (page - 1) * 5]
                } else if (reaction.emoji.name === '4️⃣') {
                  choice = searchResults.items[3 + (page - 1) * 5]
                } else if (reaction.emoji.name === '5️⃣') {
                  choice = searchResults.items[4 + (page - 1) * 5]
                } else if (reaction.emoji.name === '⬅') {
                  ytSearch(search, page - 1)
                } else if (reaction.emoji.name === '➡') {
                  ytSearch(search, page + 1)
                } else if (reaction.emoji.name === '❌') {
                  for (let i = 0; i < resultsMessage.length; i++) {
                    if (!resultsMessage[i].deleted) {
                      resultsMessage[i].delete()
                    }
                  }
                }
                if (choice) {
                  for (let i = 0; i < resultsMessage.length; i++) {
                    if (!resultsMessage[i].deleted) {
                      resultsMessage[i].delete()
                    }
                  }

                  if (!connection && !finishQueue) {
                    joinVoice(search).then(function () {
                      if (connection) {
                        if (queue.length === 0 && !nowPlaying) {
                          nowPlaying = choice
                          nowPlaying.message = search
                          YTPlay(nowPlaying)
                        } else {
                          if (finishQueue) {
                            const newMessage = new Discord.MessageEmbed()
                              .setColor('#7289da')
                              .setDescription('<@!' + search.author.id + '> Finish queue is set to true, disable it if you\'d like to add music to the queue')
                            search.channel.send(newMessage).then(function (message) {
                              sentMessages.push(message)
                              setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                            }).catch(console.error)
                          } else if (finishSong) {
                            const newMessage = new Discord.MessageEmbed()
                              .setColor('#7289da')
                              .setDescription('<@!' + search.author.id + '> Finish song is set to true, disable it if you\'d like to add music to the queue')
                            search.channel.send(newMessage).then(function (message) {
                              sentMessages.push(message)
                              setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                            }).catch(console.error)
                          } else {
                            search.content = settings.prefix + 'play ' + choice.link
                            addYTQueue(search)
                          }
                        }
                      }
                    })
                  } else if (queue.length === 0 && !nowPlaying) {
                    nowPlaying = choice
                    nowPlaying.message = search
                    YTPlay(nowPlaying)
                  } else {
                    if (finishQueue) {
                      const newMessage = new Discord.MessageEmbed()
                        .setColor('#7289da')
                        .setDescription('<@!' + search.author.id + '> Finish queue is set to true, disable it if you\'d like to add music to the queue')
                      search.channel.send(newMessage).then(function (message) {
                        sentMessages.push(message)
                        setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                      }).catch(console.error)
                    } else if (finishSong) {
                      const newMessage = new Discord.MessageEmbed()
                        .setColor('#7289da')
                        .setDescription('<@!' + search.author.id + '> Finish song is set to true, disable it if you\'d like to add music to the queue')
                      search.channel.send(newMessage).then(function (message) {
                        sentMessages.push(message)
                        setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                      }).catch(console.error)
                    } else {
                      search.content = settings.prefix + 'play ' + choice.link
                      addYTQueue(search)
                    }
                  }
                }
              })
            })
            .catch(console.error)
        }

        setTimeout(function () {
          for (let i = 0; i < resultsMessage.length; i++) {
            if (!resultsMessage[i].deleted) {
              resultsMessage[i].delete()
            }
          }
        }, 60000)
      })
    })
  })
}

async function showQueue (request, page) {
  if (page > Math.ceil((autoplayQueue.length + queue.length) / 20) && page !== 1) {
    const newMessage = new Discord.MessageEmbed()
      .setColor('#7289da')
      .setDescription('<@' + request.author.id + '> The queue is only ' + Math.ceil((autoplayQueue.length + queue.length) / 20) + ' pages long')
    request.channel.send(newMessage).then(function (message) {
      sentMessages.push(message)
      setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
    }).catch(console.error)
    return
  }
  for (let i = 0; i < showQueueMessage.length; i++) {
    if (!showQueueMessage[i].deleted) {
      showQueueMessage[i].delete()
    }
  }

  let queueMessage = ''
  for (let i = (page - 1) * 20; i < page * 20; i++) {
    if (i < queue.length && !finishSong) {
      queueMessage = queueMessage.concat('\n', i + 1, '. ', queue[i].title, ' [', queue[i].message.author.username + ']')
    } else if (settings.autoplay && i - queue.length < autoplayQueue.length && !finishQueue) {
      queueMessage = queueMessage.concat('\n', i + 1, '. ', autoplayQueue[i - queue.length].common.title, ' [autoplay]')
    }
  }
  if (queueMessage === '') {
    queueMessage = 'Nothing in Queue'
  }
  const newMessage = new Discord.MessageEmbed()
    .setColor('#7289da')
    .setTitle('Queue')
    .setDescription(queueMessage)
    .setFooter('Showing page ' + page + ' of ' + Math.ceil((autoplayQueue.length + queue.length) / 20))
  const temp = request.channel.send(newMessage)
  temp.then(function (message) {
    showQueueMessage.push(message)
    setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)

    if (page === 1 && Math.ceil((autoplayQueue.length + queue.length) / 20) > 1) {
      message.react('➡')
        .then(() => message.react('❌'))
        .then(function () {
          const filter = (reaction, user) => {
            return user.id !== message.author.id
          }

          const collector = message.createReactionCollector(filter, { max: 1, time: 60000 })

          collector.on('collect', (reaction, user) => {
            if (reaction.emoji.name === '⬅') {
              showQueue(request, page - 1)
            } else if (reaction.emoji.name === '➡') {
              showQueue(request, page + 1)
            } else if (reaction.emoji.name === '❌') {
              for (let i = 0; i < showQueueMessage.length; i++) {
                if (!showQueueMessage[i].deleted) {
                  showQueueMessage[i].delete()
                }
              }
            }
          })
        })
    } else if (page === 1) {
      message.react('❌')
        .then(function () {
          const filter = (reaction, user) => {
            return user.id !== message.author.id
          }

          const collector = message.createReactionCollector(filter, { max: 1, time: 60000 })

          collector.on('collect', (reaction, user) => {
            if (reaction.emoji.name === '⬅') {
              showQueue(request, page - 1)
            } else if (reaction.emoji.name === '➡') {
              showQueue(request, page + 1)
            } else if (reaction.emoji.name === '❌') {
              for (let i = 0; i < showQueueMessage.length; i++) {
                if (!showQueueMessage[i].deleted) {
                  showQueueMessage[i].delete()
                }
              }
            }
          })
        })
    } else if (page * 20 <= queue.length + autoplayQueue.length) {
      message.react('⬅')
        .then(() => message.react('➡'))
        .then(() => message.react('❌'))
        .then(function () {
          const filter = (reaction, user) => {
            return user.id !== message.author.id
          }

          const collector = message.createReactionCollector(filter, { max: 1, time: 60000 })

          collector.on('collect', (reaction, user) => {
            if (reaction.emoji.name === '⬅') {
              showQueue(request, page - 1)
            } else if (reaction.emoji.name === '➡') {
              showQueue(request, page + 1)
            } else if (reaction.emoji.name === '❌') {
              for (let i = 0; i < showQueueMessage.length; i++) {
                if (!showQueueMessage[i].deleted) {
                  showQueueMessage[i].delete()
                }
              }
            }
          })
        })
        .catch(console.error)
    } else {
      message.react('⬅')
        .then(() => message.react('❌'))
        .then(function () {
          const filter = (reaction, user) => {
            return user.id !== message.author.id
          }

          const collector = message.createReactionCollector(filter, { max: 1, time: 60000 })

          collector.on('collect', (reaction, user) => {
            if (reaction.emoji.name === '⬅') {
              showQueue(request, page - 1)
            } else if (reaction.emoji.name === '➡') {
              showQueue(request, page + 1)
            } else if (reaction.emoji.name === '❌') {
              for (let i = 0; i < showQueueMessage.length; i++) {
                if (!showQueueMessage[i].deleted) {
                  showQueueMessage[i].delete()
                }
              }
            }
          })
        })
        .catch(console.error)
    }
  }).catch(console.error)
}

client.login(settings.token)
client.once('ready', function () { console.log('Ready!') })

client.on('message', async function (message) {
  if (message.author.bot) return
  if (!message.content.startsWith(settings.prefix)) return
  if (message.content.startsWith(settings.prefix)) {
    message.delete()
  }
  if (message.content.startsWith(settings.prefix + 'set channel')) {
    settings.channelID = message.channel.id
    const newMessage = new Discord.MessageEmbed()
      .setColor('#7289da')
      .setDescription('Now listening to commands from <#' + settings.channelID + '>')
    message.channel.send(newMessage).then(function (message) {
      sentMessages.push(message)
      setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
    }).catch(console.error)
    fs.writeFile('config.json', JSON.stringify(settings), (error) => { if (error) throw error })
  } else if ((message.content.startsWith(settings.prefix) && settings.channelID === message.channel.id) || !settings.channelID) {
    lastCommand = message
    if (message.content.startsWith(settings.prefix + 'join')) {
      joinVoice(message)
    } else if (message.content.startsWith(settings.prefix + 'play ')) {
      if (!connection && !finishQueue) {
        joinVoice(message).then(function () {
          if (connection) {
            if (queue.length === 0 && !nowPlaying) {
              ytsr.getFilters(message.content.replace(settings.prefix + 'play ', ''), function (err, filters) {
                if (err) throw err
                var filter = filters.get('Type').find(o => o.name === 'Video')
                ytsr.getFilters(filter.ref, function (err, filters) {
                  if (err) throw err
                  var options = {
                    limit: 1,
                    nextpageRef: filter.ref
                  }
                  ytsr(null, options, function (err, searchResults) {
                    if (err) throw err
                    searchResults.items[0].message = message
                    nowPlaying = searchResults.items[0]
                    YTPlay(nowPlaying)
                  })
                })
              })
            } else {
              if (finishQueue) {
                const newMessage = new Discord.MessageEmbed()
                  .setColor('#7289da')
                  .setDescription('<@!' + message.author.id + '> Finish queue is set to true, disable it if you\'d like to add music to the queue')
                message.channel.send(newMessage).then(function (message) {
                  sentMessages.push(message)
                  setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                }).catch(console.error)
              } else if (finishSong) {
                const newMessage = new Discord.MessageEmbed()
                  .setColor('#7289da')
                  .setDescription('<@!' + message.author.id + '> Finish song is set to true, disable it if you\'d like to add music to the queue')
                message.channel.send(newMessage).then(function (message) {
                  sentMessages.push(message)
                  setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                }).catch(console.error)
              } else {
                addYTQueue(message)
              }
            }
          }
        })
      } else if (queue.length === 0 && !nowPlaying) {
        ytsr.getFilters(message.content.replace(settings.prefix + 'play ', ''), function (err, filters) {
          if (err) throw err
          var filter = filters.get('Type').find(o => o.name === 'Video')
          ytsr.getFilters(filter.ref, function (err, filters) {
            if (err) throw err
            var options = {
              limit: 1,
              nextpageRef: filter.ref
            }
            ytsr(null, options, function (err, searchResults) {
              if (err) throw err
              searchResults.items[0].message = message
              nowPlaying = searchResults.items[0]
              if (finishQueue) {
                const newMessage = new Discord.MessageEmbed()
                  .setColor('#7289da')
                  .setDescription('<@!' + message.author.id + '> Finish queue is set to true, disable it if you\'d like to add music to the queue')
                message.channel.send(newMessage).then(function (message) {
                  sentMessages.push(message)
                  setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                }).catch(console.error)
              } else if (finishSong) {
                const newMessage = new Discord.MessageEmbed()
                  .setColor('#7289da')
                  .setDescription('<@!' + message.author.id + '> Finish song is set to true, disable it if you\'d like to add music to the queue')
                message.channel.send(newMessage).then(function (message) {
                  sentMessages.push(message)
                  setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                }).catch(console.error)
              } else {
                YTPlay(nowPlaying)
              }
            })
          })
        })
      } else {
        if (finishQueue) {
          const newMessage = new Discord.MessageEmbed()
            .setColor('#7289da')
            .setDescription('<@!' + message.author.id + '> Finish queue is set to true, disable it if you\'d like to add music to the queue')
          message.channel.send(newMessage).then(function (message) {
            sentMessages.push(message)
            setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
          }).catch(console.error)
        } else if (finishSong) {
          const newMessage = new Discord.MessageEmbed()
            .setColor('#7289da')
            .setDescription('<@!' + message.author.id + '> Finish song is set to true, disable it if you\'d like to add music to the queue')
          message.channel.send(newMessage).then(function (message) {
            sentMessages.push(message)
            setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
          }).catch(console.error)
        } else {
          addYTQueue(message)
        }
      }
    } else if (message.content.startsWith(settings.prefix + 'pause')) {
      if (!dispatcher) {
        const newMessage = new Discord.MessageEmbed()
          .setColor('#7289da')
          .setDescription('<@!' + message.author.id + '> There\'s nothing to pause')
        message.channel.send(newMessage).then(function (message) {
          sentMessages.push(message)
          setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
        }).catch(console.error)
      } else {
        upDateNowPlaying(true)
        dispatcher.pause(true)
      }
    } else if (message.content.startsWith(settings.prefix + 'resume')) {
      if (!dispatcher) {
        const newMessage = new Discord.MessageEmbed()
          .setColor('#7289da')
          .setDescription('<@!' + message.author.id + '> There\'s nothing to resume')
        message.channel.send(newMessage).then(function (message) {
          sentMessages.push(message)
          setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
        }).catch(console.error)
      } else {
        upDateNowPlaying(false)
        dispatcher.resume(true)
      }
    } else if (message.content.startsWith(settings.prefix + 'skip') || message.content.startsWith(settings.prefix + 'next')) {
      if (!dispatcher) {
        const newMessage = new Discord.MessageEmbed()
          .setColor('#7289da')
          .setDescription('<@!' + message.author.id + '> There\'s nothing to skip')
        message.channel.send(newMessage).then(function (message) {
          sentMessages.push(message)
          setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
        }).catch(console.error)
      } else {
        dispatcher.destroy()
        if (!nowPlaying.fileName) {
          const newMessage = new Discord.MessageEmbed()
            .setColor('#7289da')
            .setDescription('<@!' + message.author.id + '> Skipped ' + nowPlaying.title)
          message.channel.send(newMessage).then(function (message) {
            sentMessages.push(message)
            setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
          }).catch(console.error)
        } else {
          const newMessage = new Discord.MessageEmbed()
            .setColor('#7289da')
            .setDescription('<@!' + message.author.id + '> Skipped ' + nowPlaying.common.title)
          message.channel.send(newMessage).then(function (message) {
            sentMessages.push(message)
            setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
          }).catch(console.error)
        }
        playNext()
      }
    } else if (message.content.startsWith(settings.prefix + 'stop')) {
      if (voiceChannel) {
        voiceChannel.leave()
      }
      if (dispatcher) {
        dispatcher.destroy()
        dispatcher = undefined
      }

      for (let i = 0; i < sentMessages.length; i++) {
        if (!sentMessages[i].deleted) {
          sentMessages[i].delete()
        }
      }
      for (let i = 0; i < ytSearchMessage.length; i++) {
        if (!ytSearchMessage[i].deleted) {
          for (let j = 0; j < ytSearchMessage[i].length; j++) {
            if (!ytSearchMessage[i][j].deleted) {
              ytSearchMessage[i][j].delete()
            }
          }
          ytSearchMessage[i].deleted = true
        }
      }
      for (let i = 0; i < showQueueMessage.length; i++) {
        if (!showQueueMessage[i].deleted) {
          showQueueMessage[i].delete()
        }
      }

      nowPlaying = undefined
      connection = undefined
      finishSong = false
      finishQueue = false
      voiceChannel = undefined
      queue = []
      sentMessages = []
    } else if (message.content.startsWith(settings.prefix + 'remove ')) {
      ytsr.getFilters(message.content.replace(settings.prefix + 'remove ', ''), function (err, filters) {
        if (err) throw err
        var filter = filters.get('Type').find(o => o.name === 'Video')
        ytsr.getFilters(filter.ref, function (err, filters) {
          if (err) throw err
          var options = {
            limit: 1,
            nextpageRef: filter.ref
          }
          ytsr(null, options, function (err, searchResults) {
            if (err) throw err
            let deleted = false
            for (let i = 0; i < queue.length; i++) {
              if (queue[i].link === searchResults.items[0].link) {
                const newMessage = new Discord.MessageEmbed()
                  .setColor('#7289da')
                  .setDescription('<@' + message.author.id + '> Removed ' + queue[i].title + ' from the queue')
                message.channel.send(newMessage).then(function (message) {
                  sentMessages.push(message)
                  setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
                }).catch(console.error)
                deleted = true
                queue.splice(i, 1)
              }
            }
            if (!deleted) {
              const newMessage = new Discord.MessageEmbed()
                .setColor('#7289da')
                .setDescription('<@' + message.author.id + '> could not find "' + message.content.replace(settings.prefix + 'remove ', '') + '" in the queue')
              message.channel.send(newMessage).then(function (message) {
                sentMessages.push(message)
                setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
              }).catch(console.error)
            }
            upDateNowPlaying()
          })
        })
      })
    } else if (message.content.startsWith(settings.prefix + 'start autoplay')) {
      if (!settings.autoplay) {
        const newMessage = new Discord.MessageEmbed()
          .setColor('#7289da')
          .setDescription('<@!' + message.author.id + '> Autoplay is not toggled on')
        message.channel.send(newMessage).then(function (message) {
          sentMessages.push(message)
          setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
        }).catch(console.error)
      } else {
        if (!connection) {
          joinVoice(message).then(function () {
            if (connection) {
              nowPlaying = autoplayQueue[0]
              autoPlay(autoplayQueue[0])
              autoplayQueue.shift()
              queue = []
            }
          })
        } else {
          nowPlaying = autoplayQueue[0]
          autoPlay(autoplayQueue[0])
          autoplayQueue.shift()
          queue = []
        }
      }
    } else if (message.content.startsWith(settings.prefix + 'clear queue')) {
      queue = []
      const newMessage = new Discord.MessageEmbed()
        .setColor('#7289da')
        .setDescription('<@!' + message.author.id + '> Cleared the queue')
      message.channel.send(newMessage).then(function (message) {
        sentMessages.push(message)
        setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
      }).catch(console.error)
      upDateNowPlaying()
    } else if (message.content.startsWith(settings.prefix + 'toggle autoplay')) {
      settings.autoplay = !settings.autoplay
      const newMessage = new Discord.MessageEmbed()
        .setColor('#7289da')
        .setDescription('<@!' + message.author.id + '> Autoplay now set to ' + settings.autoplay)
      message.channel.send(newMessage).then(function (message) {
        sentMessages.push(message)
        setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
      }).catch(console.error)
      if (settings.autoplay && autoplayQueue.length < 6) {
        autoplayInit().then(upDateNowPlaying())
      } else {
        autoplayQueue = []
        upDateNowPlaying()
      }
      fs.writeFile('config.json', JSON.stringify(settings), (error) => { if (error) throw error })
    } else if (message.content.startsWith(settings.prefix + 'toggle finish song')) {
      finishSong = !finishSong
      const newMessage = new Discord.MessageEmbed()
        .setColor('#7289da')
        .setDescription('<@!' + message.author.id + '> Finish song now set to ' + finishSong)
      message.channel.send(newMessage).then(function (message) {
        sentMessages.push(message)
        setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
      }).catch(console.error)
    } else if (message.content.startsWith(settings.prefix + 'toggle finish queue')) {
      finishQueue = !finishQueue
      const newMessage = new Discord.MessageEmbed()
        .setColor('#7289da')
        .setDescription('<@!' + message.author.id + '> Finish queue now set to ' + finishQueue)
      message.channel.send(newMessage).then(function (message) {
        sentMessages.push(message)
        setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
      }).catch(console.error)
    } else if (message.content.startsWith(settings.prefix + 'search ')) {
      ytSearch(message, 1)
    } else if (message.content.startsWith(settings.prefix + 'show queue ')) {
      const page = parseInt(message.content.replace(settings.prefix + 'show queue ', ''))
      if (!page) {
        const newMessage = new Discord.MessageEmbed()
          .setColor('#7289da')
          .setDescription('<@' + message.author.id + '> That was not an integer')
        message.channel.send(newMessage).then(function (message) {
          sentMessages.push(message)
          setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
        }).catch(console.error)
      } else {
        showQueue(message, page)
      }
    } else if (message.content.startsWith(settings.prefix + 'show queue')) {
      showQueue(message, 1)
    } else if (message.content.startsWith(settings.prefix + 'help')) {
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
        '**"' + settings.prefix + 'clear queue"**\nBot will clear the current queue.\n\n' +
        '**"' + settings.prefix + 'stop"**\nImmediately stops playing, clears the queue, and leaves the voice channel.\n\n' +
        '**"' + settings.prefix + 'toggle finish song"**\nToggles whether or not the bot will finish playing the current song then leave. New requests will not be honored when true.\n\n' +
        '**"' + settings.prefix + 'toggle finish queue"**\nToggles whether or not the bot will finish playing the queue then leave. New requests will not be honored when true.\n\n' +
        '**"' + settings.prefix + 'toggle autoplay"**\nToggles whether or not bot will play songs from the autoplay folder when queue is empty. When disabled, bot will automatically leave after 60 seconds when queue is empty.\n\n' +
        '**"' + settings.prefix + 'set channel"**\nBot sets the channel the bot will listen to. Bot will notify users if they try to user a different channel.\n\n' +
        '**"' + settings.prefix + 'clear channel"**\nBot will delete that last 100 messages in the channel')
      client.users.cache.get(message.author.id).send(newMessage)
    } else if (message.content.startsWith(settings.prefix + 'clear channel')) {
      message.channel.bulkDelete(100).catch(console.error)
    } else {
      const newMessage = new Discord.MessageEmbed()
        .setColor('#7289da')
        .setDescription('<@' + message.author.id + '> that is not a valid command! Use "' + settings.prefix + 'help" to show available commands')
      message.channel.send(newMessage).then(function (message) {
        sentMessages.push(message)
        setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
      }).catch(console.error)
    }
  } else {
    const newMessage = new Discord.MessageEmbed()
      .setColor('#7289da')
      .setDescription('Please use <#' + settings.channelID + '> to send commands to this bot')
    message.channel.send(newMessage).then(function (message) {
      sentMessages.push(message)
      setTimeout(function () { if (!message.deleted) { message.delete() } }, 60000)
    }).catch(console.error)
  }
})
