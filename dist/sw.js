// sw-v3
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('push', (event) => {
  let title = '🔔 Nursery Notification'
  let body = 'Tap to open the app'
  let icon = '/icon.png'

  try {
    if (event.data) {
      const data = JSON.parse(event.data.text())
      if (data.title) title = data.title
      if (data.body) body = data.body
      if (data.icon) icon = data.icon
    }
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      vibrate: [200, 100, 200],
      tag: 'nursery-' + Date.now(),
      requireInteraction: false,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) return client.focus()
        }
        return clients.openWindow('/')
      })
  )
})
