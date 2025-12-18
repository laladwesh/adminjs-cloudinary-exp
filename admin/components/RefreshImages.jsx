import React, { useState, useEffect } from 'react'

const RefreshImages = (props) => {
  const { record } = props
  const id = record ? (typeof record.id === 'function' ? record.id() : record.id) : null
  const [loading, setLoading] = useState(false)
  const [urls, setUrls] = useState([])

  const fetchRecord = async () => {
    if (!id) return
    setLoading(true)
    try {
      const endpoints = [
        `/admin/api/image-urls/${id}`,
        `/admin/api/resources/Image/records/${id}`,
        `/admin/api/resources/image/records/${id}`,
      ]
      let got = false
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          })
          console.log('RefreshImages: fetch', ep, 'status', res.status)
          if (!res.ok) {
            const txt = await res.text().catch(() => '')
            console.warn('RefreshImages: non-ok response', ep, res.status, txt)
            continue
          }
          const data = await res.json()
          console.log('RefreshImages: response json', data)
          // support multiple response shapes:
          // - { imageUrls: [...] }
          // - AdminJS record response: { record: { params: { imageUrls: [...] } } }
          const r = data.record || data
          const fetched = data.imageUrls || r?.params?.imageUrls || []
          setUrls(Array.isArray(fetched) ? fetched : [fetched].filter(Boolean))
          got = true
          break
        } catch (e) {
          console.warn('RefreshImages: fetch error for', ep, e)
        }
      }
      if (!got) setUrls([])
    } catch (err) {
      setUrls([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecord()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleRefresh = async () => {
    await fetchRecord()
  }

  return (
    <div style={{ marginTop: 8 }}>
      {Array.isArray(urls) && urls.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {urls.map((u, i) => (
            <a key={i} href={u} target="_blank" rel="noreferrer">
              <img src={u} alt={`img-${i}`} style={{ maxWidth: 200, maxHeight: 200, objectFit: 'cover', borderRadius: 4 }} />
            </a>
          ))}
        </div>
      ) : (
        <div style={{ marginBottom: 8, color: '#666' }}>{loading ? 'Loading...' : 'No images'}</div>
      )}

      <button type="button" className="btn btn-default" onClick={handleRefresh} disabled={loading}>
        {loading ? 'Refreshing...' : 'Refresh images'}
      </button>
    </div>
  )
}

export default RefreshImages
