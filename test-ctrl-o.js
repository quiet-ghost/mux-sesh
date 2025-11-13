// Test what key events look like
import { stdin } from 'process'

console.log('Press Ctrl+O (then Ctrl+C to exit)')
console.log('Testing key detection...\n')

stdin.setRawMode(true)
stdin.on('data', (data) => {
  const byte = data[0]
  console.log('Key pressed:')
  console.log('  Byte:', byte)
  console.log('  Char:', String.fromCharCode(byte))
  console.log('  Hex:', '0x' + byte.toString(16))
  
  if (byte === 15) {
    console.log('  -> This is Ctrl+O!')
  }
  
  if (byte === 3) {
    console.log('\nExiting...')
    process.exit(0)
  }
  console.log()
})
