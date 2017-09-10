const { spawn } = require('child_process')
const { format } = require('date-fns')

const main = ({ path = `${process.cwd()}/dumps`, host = 'mongo', db = 'bm-platform' } = {}) => {
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
      `--out=/data/${now}`
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
    console.log('finish')
  })
}

main({
  path: process.env.BACKUP_PATH,
  host: process.env.MONGO_HOST,
  db: process.env.MONGO_DB
})
