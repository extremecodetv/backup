const fs = require('fs')
const { spawn } = require('child_process')
const { format } = require('date-fns')
const AWS = require('aws-sdk')
const logUpdate = require('log-update')
const pretty = require('prettysize')

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  signatureVersion: 'v4'
})

const main = async ({ path = `${process.cwd()}/dumps`, host = 'mongo', db = 'bm-platform' } = {}) => {
  const now = format(new Date(), 'YYYY-MM-DD-HH-mm-ss')
  const mongodump = spawn('docker',
    [
      'run',
      '-i',
      '--rm',
      '-v',
      `${path}:/data`,
      '--link',
      'mongo:mongo',
      'mongo',
      'mongodump',
      '--host',
      host,
      '--db',
      db,
      `--archive=/data/${now}.archive`
    ], {
      encoding: 'utf8'
    }
  )

  mongodump.stdout.setEncoding('utf8')
  mongodump.stderr.setEncoding('utf8')
  mongodump.stderr.on('data', data => {
    console.log(data)
  })
  mongodump.on('error', error => {
    console.log('ERROR', error)
  })
  mongodump.on('close', code => {
    const s3 = new AWS.S3()
    console.log('uploading to s3')
    const body = fs.createReadStream(`${path}/${now}.archive`)

    s3.upload({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `${now}.archive`,
      Body: body
    })
      .on('httpUploadProgress', ({ loaded, total }) => {
        logUpdate(`${pretty(loaded, true)}/${pretty(total, true)}`)
      })
      .send((error, uploaded) => {
        if (error) {
          console.log('ERROR', error)
        } else {
          console.log('s3 link', uploaded.Location)
        }
        console.log('finish')
      })
  })
}

main({
  path: process.env.BACKUP_PATH,
  host: process.env.MONGO_HOST,
  db: process.env.MONGO_DB
})
