// ============================================================
// Chart primitives for the PDF report. Pure react-pdf SVG/View
// components — no recharts, no canvas, no Chromium. Safe on
// Vercel serverless.
// ============================================================

import React from 'react'
import {
  Line as SvgLine,
  Polyline,
  Rect,
  Svg,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'

export const CHART_COLORS = {
  primary: '#2563eb',
  primarySoft: '#93c5fd',
  accent: '#0f766e',
  human: '#f59e0b',
  bot: '#7c3aed',
  grid: '#e5e7eb',
  text: '#6b7280',
  bar: '#3b82f6',
  barAlt: '#10b981',
  negative: '#ef4444',
}

const chartStyles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  title: { fontSize: 10, fontWeight: 'bold', color: '#111827', marginBottom: 6 },
  axisLabel: { fontSize: 7, color: CHART_COLORS.text },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4, marginRight: 4 },
  legendText: { fontSize: 8, color: CHART_COLORS.text },
})

export interface SeriesPoint {
  label: string
  value: number
}

function niceMax(values: number[]): number {
  const max = Math.max(...values, 1)
  const magnitude = 10 ** Math.floor(Math.log10(max))
  const scaled = max / magnitude
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return nice * magnitude
}

// ------------------------------------------------------------
// Line chart — single or dual series over daily labels
// ------------------------------------------------------------

export function LineChart({
  title,
  series,
  height = 110,
}: {
  title?: string
  series: { name: string; color: string; points: SeriesPoint[] }[]
  height?: number
}) {
  const width = 500
  const padLeft = 28
  const padBottom = 14
  const plotW = width - padLeft
  const plotH = height - padBottom
  const allValues = series.flatMap((s) => s.points.map((p) => p.value))
  const max = niceMax(allValues)
  const n = Math.max(...series.map((s) => s.points.length), 2)
  const x = (i: number) => padLeft + (i / (n - 1)) * (plotW - 8)
  const y = (v: number) => plotH - (v / max) * (plotH - 6)

  const labels = series[0]?.points.map((p) => p.label) ?? []
  const labelEvery = Math.max(1, Math.ceil(labels.length / 6))

  return (
    <View style={chartStyles.wrap} wrap={false}>
      {title ? <Text style={chartStyles.title}>{title}</Text> : null}
      {series.map((s) => (
        <View key={s.name} style={chartStyles.legendRow}>
          <View style={[chartStyles.legendDot, { backgroundColor: s.color }]} />
          <Text style={chartStyles.legendText}>{s.name}</Text>
        </View>
      ))}
      <Svg width={width} height={height + 4}>
        {[0, 0.5, 1].map((f) => (
          <React.Fragment key={f}>
            <SvgLine
              x1={padLeft}
              y1={y(max * f)}
              x2={width}
              y2={y(max * f)}
              stroke={CHART_COLORS.grid}
              strokeWidth={0.7}
            />
            <Text x={0} y={y(max * f) + 3} style={{ fontSize: 7, fill: CHART_COLORS.text }}>
              {String(Math.round(max * f))}
            </Text>
          </React.Fragment>
        ))}
        {labels.map((lb, i) =>
          i % labelEvery === 0 || i === labels.length - 1 ? (
            <Text
              key={lb + i}
              x={Math.min(x(i), width - 24)}
              y={height}
              style={{ fontSize: 7, fill: CHART_COLORS.text }}
            >
              {lb}
            </Text>
          ) : null,
        )}
        {series.map((s) => (
          <Polyline
            key={s.name}
            points={s.points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
            stroke={s.color}
            strokeWidth={1.6}
            fill="none"
          />
        ))}
      </Svg>
    </View>
  )
}

// ------------------------------------------------------------
// Horizontal bars — top items / rankings
// ------------------------------------------------------------

export function HBarChart({
  title,
  items,
  color = CHART_COLORS.bar,
}: {
  title?: string
  items: { label: string; value: number; hint?: string }[]
  color?: string
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  const trackW = 500
  return (
    <View style={chartStyles.wrap} wrap={false}>
      {title ? <Text style={chartStyles.title}>{title}</Text> : null}
      {items.map((item) => (
        <View key={item.label} style={{ marginBottom: 5 }} wrap={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 8.5, color: '#111827', maxWidth: 340 }}>
              {item.label.length > 42 ? `${item.label.slice(0, 42)}…` : item.label}
            </Text>
            <Text style={{ fontSize: 8.5, color: '#374151' }}>
              {item.hint ?? String(item.value)}
            </Text>
          </View>
          <View style={{ height: 6, backgroundColor: '#f3f4f6', marginTop: 2, width: trackW }}>
            <Rect
              width={Math.max(3, (item.value / max) * trackW)}
              height={6}
              fill={color}
            />
          </View>
        </View>
      ))}
    </View>
  )
}

// ------------------------------------------------------------
// Stacked horizontal bar — part-to-whole (bot vs human share)
// ------------------------------------------------------------

export function StackedBar({
  title,
  segments,
}: {
  title?: string
  segments: { label: string; value: number; color: string }[]
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1
  const trackW = 500
  return (
    <View style={chartStyles.wrap} wrap={false}>
      {title ? <Text style={chartStyles.title}>{title}</Text> : null}
      <View style={{ flexDirection: 'row', height: 12, backgroundColor: '#f3f4f6', width: trackW }}>
        {segments.map((seg) => (
          <Rect
            key={seg.label}
            width={(seg.value / total) * trackW}
            height={12}
            fill={seg.color}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4, flexWrap: 'wrap' }}>
        {segments.map((seg) => (
          <View key={seg.label} style={[chartStyles.legendRow, { marginRight: 14 }]}>
            <View style={[chartStyles.legendDot, { backgroundColor: seg.color }]} />
            <Text style={chartStyles.legendText}>
              {seg.label} · {Math.round((seg.value / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
