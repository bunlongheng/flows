// 1 hashtag as a pill. An empty tag is the owner's "+ #" add button.
export function HashPill({ tag, small }) {
  return (
    <span style={{ fontSize: small ? 9 : 11, fontWeight: 700, padding: small ? '1px 6px' : '2px 8px', borderRadius: 20, background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', whiteSpace: 'nowrap', lineHeight: 1.5 }}>
      {tag ? `#${tag}` : '+ #'}
    </span>
  )
}
