const { spawn } = require('child_process')
const { format } = require('date-fns')

const main = async (path = `${process.cwd()}/dumps`) => {
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
      'mongo',
      '--db',
      'bm-platform',
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
    process.exit(code)
  })
}

main()
