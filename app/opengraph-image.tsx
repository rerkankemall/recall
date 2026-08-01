import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Afterword — Reading memory log';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#14171c',
          color: '#f5f5f0',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>Afterword</div>
        <div style={{ fontSize: 30, marginTop: 28, color: '#9a9a94', maxWidth: 880, textAlign: 'center' }}>
          You forget most of what you read. Afterword fixes that.
        </div>
      </div>
    ),
    { ...size }
  );
}
