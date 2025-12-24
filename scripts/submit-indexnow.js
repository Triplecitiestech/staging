#!/usr/bin/env node

/**
 * Submit URLs to Bing IndexNow API
 * This notifies search engines about new or updated content
 */

const API_KEY = 'b029ccc70563403e9c9bbbd9550d41e2'
const HOST = 'www.triplecitiestech.com'
const KEY_LOCATION = `https://${HOST}/${API_KEY}.txt`

const urls = [
  `https://${HOST}`,
  `https://${HOST}/about`,
  `https://${HOST}/services`,
  `https://${HOST}/industries`,
  `https://${HOST}/contact`,
  `https://${HOST}/support`
]

const payload = {
  host: HOST,
  key: API_KEY,
  keyLocation: KEY_LOCATION,
  urlList: urls
}

async function submitToIndexNow() {
  try {
    console.log('Submitting URLs to IndexNow API...')
    console.log(`Submitting ${urls.length} URLs:`)
    urls.forEach(url => console.log(`  - ${url}`))
    console.log()

    const response = await fetch('https://api.indexnow.org/IndexNow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    })

    console.log(`Response Status: ${response.status} ${response.statusText}`)

    if (response.status === 200) {
      console.log('✓ URLs submitted successfully!')
      console.log('\nNext steps:')
      console.log('1. Verify submission in Bing Webmaster Tools')
      console.log('2. Check indexing status in a few hours')
    } else if (response.status === 400) {
      console.log('✗ Bad request - Invalid format')
    } else if (response.status === 403) {
      console.log('✗ Forbidden - Key validation failed')
      console.log(`Make sure ${KEY_LOCATION} is accessible`)
    } else if (response.status === 422) {
      console.log('✗ Unprocessable Entity - URLs don\'t belong to host or key mismatch')
    } else if (response.status === 429) {
      console.log('✗ Too Many Requests - Please wait and try again later')
    } else {
      const text = await response.text()
      console.log('Response:', text)
    }

  } catch (error) {
    console.error('Error submitting to IndexNow:', error.message)
    process.exit(1)
  }
}

submitToIndexNow()
