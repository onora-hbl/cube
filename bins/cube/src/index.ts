async function main() {
  console.log('cube cli')

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
