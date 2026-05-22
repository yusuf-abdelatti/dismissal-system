import { useState } from 'react'
import { supabase } from '../supabaseClient'

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

const checkSupported = () => {
  if (typeof Notification === 'undefined') return false
  if (!('serviceWorker' in navigator)) return false
  if (!('PushManager' in window)) return false
  return true
}

export function usePushNotifications(userId) {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [subscribed, setSubscribed] = useState(false)
  const [error, setError] = useState(null)

  const subscribe = async () => {
    try {
      setError(null)

      if (!checkSupported()) {
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
        if (isIOS) {
          setError('On iPhone: tap Share → "Add to Home Screen" first, then enable notifications.')
        } else {
          setError('Please use Chrome browser for notifications.')
        }
        return
      }

      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') {
        setError('Permission denied. Please allow notifications in browser settings.')
        return
      }

      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setError('Configuration error. Contact administrator.')
        return
      }

      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const subscriptionJson = pushSubscription.toJSON()

      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: userId,
          subscription: JSON.stringify(subscriptionJson),
          endpoint: subscriptionJson.endpoint,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,endpoint'
        })

      if (dbError) {
        setError('Could not save subscription. Try again.')
        return
      }

      setSubscribed(true)
    } catch (err) {
      // subscribe failed — error state shown in UI
      setError(err.message ?? 'Something went wrong.')
    }
  }

  return { permission, subscribed, error, isSupported: checkSupported(), subscribe }
}
