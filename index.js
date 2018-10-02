const fs = require('fs')
const { format } = require('date-fns')
const AWS = require('aws-sdk')
const logUpdate = require('log-update')
const pretty = require('prettysize')
const execa = require('execa')
const meow = require('meow')
const del = require('del')

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  signatureVersion: 'v4'
})

const cli = meow(`
  Options
    --upload, -u  Upload backup to S3
    --gzip,   -g  Compresses the dump
    --clean   -c  Clean disk after backup
    --encrypt <password>  -e  Set password to archive
`, {
  alias: {
    u: 'upload',
    g: 'gzip',
    c: 'clean',
    e: 'encrypt',
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

const cleanDisk = async (path, now) => {
  const pathsToDel = [
    `${path}/*.*`,
    `!${path}/${now}.*`
  ]

  await del(pathsToDel, { force: true, dryRun: true })
}

const secure = async (name, backupPath, password) => {
  try {
    let enctyptedName = `${name}.zip`
    zip = await execa.shell(`zip -P ${password} ${enctyptedName} ${backupPath}/${name}`)
    return enctyptedName
  } catch (e) {
    console.log(e)
    process.exit()
  }
}

const main = async ({ s3 = false, gzip = false, clean = false, encrypt = false, path = `${process.cwd()}/dumps`, host = 'localhost', db = 'bm-platform' } = {}) => {
  const now = format(new Date(), 'YYYY-MM-DD')
  const backupName = gzip ? `${now}.agz` : `${now}.archive`
  const mongodump = execa.shell(`docker run -i --rm --user \`id -u\` -v ${path}:/data mongo mongodump --host ${host} --db ${db} ${gzip ? '--gzip' : ''} --archive=/data/${backupName} --excludeCollection loggers`)
  mongodump.stderr.setEncoding('utf8')
  mongodump.stderr.on('data', data => {
    console.log(data)
  })
  mongodump.on('error', error => {
    console.log('ERROR', error)
  })
  mongodump.on('close', async code => {
    if (encrypt) {
      backupName = await secure(backupName, path, encrypt)
    }

    let outputPath = `${path}/${backupName}`;
    if (clean) {
      await cleanDisk(path, now)
    }

    if (s3) {
      const body = fs.createReadStream(outputPath)
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
  clean: cli.flags.clean,
  encrypt: cli.flags.encrypt,
  path: process.env.BACKUP_PATH,
  host: process.env.MONGO_HOST,
  db: process.env.MONGO_DB
})
