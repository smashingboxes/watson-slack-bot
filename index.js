require('dotenv').config();
const RtmClient = require('@slack/client').RtmClient;
const WebClient = require('@slack/client').WebClient;
const RTM_EVENTS = require('@slack/client').RTM_EVENTS;
const VisualRecognitionV3 = require('watson-developer-cloud/visual-recognition/v3');
const fs = require('fs');
const request = require('request');
const path = require('path');

const rtm = new RtmClient(process.env.SLACK_TOKEN);
const web = new WebClient(process.env.SLACK_TOKEN);

function recognize(image) {
  const visual_recognition = new VisualRecognitionV3({
    api_key: process.env.WATSON_KEY,
    version_date: '2016-05-19'
  });

  const params = {
    images_file: fs.createReadStream(image)
  };

  return new Promise((resolve, reject) => {
    visual_recognition.classify(params, function(err, res) {
      if (err) {
        return reject(err);
      } else {
        return resolve(res);
      }
    });
  });
};

rtm.on(RTM_EVENTS.MESSAGE, (message) => {
  if (!message.text ) { return }
  if (message.user === rtm.activeUserId) { return }


  if (message.file || message.text.match(/.(png|jpg|gif|jpeg)>$/)) {
    const permalink = (message.file)? message.file.url_private : message.text.replace('<', '').replace('>', '');
    const filename = 'tmp/' + Math.random().toString(36).substring(7) + path.extname(permalink);
    request({
      uri: permalink,
      headers: {
        'Authorization': 'Bearer ' + process.env.SLACK_TOKEN
      }
    }).pipe(fs.createWriteStream(filename)).on('close', () => {
      recognize(`./${filename}`)
        .then((object) => {
          const [primaryClass, ...secondaryClasses] = object.images[0].classifiers[0].classes;
          const primaryItem = primaryClass['class'];
          fields = secondaryClasses.map((aClass) => {
            return {
              short: true,
              title: aClass['class'],
              value: `${Math.round(aClass.score * 100)}%`
            };
          });
          body = {
            as_user: true,
            attachments: [
              {
                color: "#466BB0",
                title: `Looks like you posted an image with a ${primaryItem} in it`,
                text: "Other things I see:",
                fields: fields
              }
            ]
          };

          web.chat.postMessage(message.channel, '', body, (err) => {
            if (err) { console.log(err) }
          });
        })
        .catch((err) => {
          console.log(err);
        });
    })
  }
});

rtm.start();
