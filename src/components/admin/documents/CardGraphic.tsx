'use client'

import { useState } from 'react'
import CardImageControls from '@/components/admin/documents/CardImageControls'

/**
 * One branded social card preview + its AI-image controls. Client component so
 * it can cache-bust the <img> after generating/clearing the AI background.
 */
export default function CardGraphic({
  slug,
  index,
  hasImage,
  configured,
}: {
  slug: string
  index: number
  hasImage: boolean
  configured: boolean
}) {
  const [bust, setBust] = useState(0)
  const base = `/api/admin/documents/social/${slug}/card?i=${index}`
  const v = bust ? `&v=${bust}` : ''

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${base}&size=1200x628${v}`}
        alt={`Post ${index + 1} branded card`}
        width={1200}
        height={628}
        className="w-full rounded-lg border border-white/10"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <a
            href={`${base}&size=1200x628${v}`}
            download={`${slug}-${index + 1}-1200x628.png`}
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 px-3 py-1.5 text-xs font-bold text-cyan-400 transition-all hover:bg-cyan-400/10"
          >
            Download 1200×628
          </a>
          <a
            href={`${base}&size=800x800${v}`}
            download={`${slug}-${index + 1}-800x800.png`}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 transition-all hover:border-cyan-400/30 hover:text-cyan-300"
          >
            Download 800×800
          </a>
        </div>
        <CardImageControls
          slug={slug}
          index={index}
          hasImage={hasImage}
          configured={configured}
          onChanged={() => setBust(Date.now())}
        />
      </div>
    </div>
  )
}
