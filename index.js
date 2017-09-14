const fs = require('fs')
const { format } = require('date-fns')
const AWS = require('aws-sdk')
const logUpdate = require('log-update')
const pretty = require('prettysize')
const execa = require('execa')
const meow = require('meow')

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  signatureVersion: 'v4'
})

const cli = meow(`
  Options
    --upload, -u  Upload backup to S3
    --gzip,   -g  Compresses the dump
`, {
  alias: {
    u: 'upload',
    h: 'help',
    v: 'version'
  }
})

const uploadToS3 = (key, body, cb) => {
  const s3 = new AWS.S3()
  console.log('uploading to s3')

  const s3object = s3.upload({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Body: body
  })

  s3object
    .on('httpUploadProgress', ({ loaded, total }) => {
      logUpdate(`${pretty(loaded, true)}/${pretty(total, true)}`)
    })
    .send((error, uploaded) => {
      if (error) {
        cb(error)
      } else {
        cb(null, uploaded.Location)
      }
    })
}

const main = async ({ s3 = false, gzip = false, path = `${process.cwd()}/dumps`, host = 'localhost', db = 'bm-platform' } = {}) => {
  const now = format(new Date(), 'YYYY-MM-DD')
  const backupName = gzip ? `${now}.agz` : `${now}.archive`
  const mongodump = execa.shell(`docker run -i --rm --user \`id -u\` -v ${path}:/data mongo mongodump --host ${host} --db ${db} ${gzip ? '--gzip' : ''} --archive=/data/${backupName}`)
  mongodump.stderr.setEncoding('utf8')
  mongodump.stderr.on('data', data => {
    console.log(data)
  })
  mongodump.on('error', error => {
    console.log('ERROR', error)
  })
  mongodump.on('close', code => {
    if (s3) {
      const body = fs.createReadStream(`${path}/${backupName}`)
      uploadToS3(backupName, body, (err, link) => {
        if (err) {
          console.log('ERROR', err)
        } else {
          console.log('finish', backupName)
        }
      })
    } else {
      console.log('finish')
    }
  })
}

main({
  s3: cli.flags.upload,
  gzip: cli.flags.gzip,
  path: process.env.BACKUP_PATH,
  host: process.env.MONGO_HOST,
  db: process.env.MONGO_DB
})
