"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CHAIN_COLORS, CHAIN_DISPLAY_NAMES } from "@/lib/cijene";

interface HistoryDataPoint {
  date: string;
  prices: { chain: string; minPrice: number; avgPrice: number }[];
}

interface PriceHistoryChartProps {
  barcode: string;
  productName: string;
  city: string;
  chain?: string;
}

const TIME_RANGES = [
  { label: "7 dana", days: 7 },
  { label: "30 dana", days: 30 },
  { label: "90 dana", days: 90 },
  { label: "180 dana", days: 180 },
  { label: "1 godina", days: 365 },
];

export default function PriceHistoryChart({
  barcode,
  productName,
  city,
  chain,
}: PriceHistoryChartProps) {
  const [historyData, setHistoryData] = useState<HistoryDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState(30);
  const [priceType, setPriceType] = useState<"min" | "avg">("min");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        barcode,
        name: productName,
        city,
        days: selectedDays.toString(),
      });
      if (chain) params.set("chain", chain);

      const res = await fetch(`/api/history?${params}`);
      if (!res.ok) throw new Error("Failed to fetch history");
      const data = await res.json();
      setHistoryData(data.history || []);
    } catch {
      setError("Nije moguće učitati povijest cijena");
    } finally {
      setLoading(false);
    }
  }, [barcode, productName, city, chain, selectedDays]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Transform data for recharts
  const chartData = historyData.map((point) => {
    const entry: Record<string, string | number> = {
      date: point.date.slice(5), // MM-DD format
      fullDate: point.date,
    };
    for (const p of point.prices) {
      entry[p.chain] =
        priceType === "min"
          ? parseFloat(p.minPrice.toFixed(2))
          : parseFloat(p.avgPrice.toFixed(2));
    }
    return entry;
  });

  // Get all chains present in the data
  const chains = new Set<string>();
  historyData.forEach((point) => {
    point.prices.forEach((p) => chains.add(p.chain));
  });

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split("-");
    return `${parts[1]}.${parts[0]}`;
  };

  const formatPrice = (value: number) => `${value.toFixed(2)} €`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 bg-white rounded-xl border border-gray-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Učitavanje povijesti cijena...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-32 bg-red-50 rounded-xl border border-red-100">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 bg-gray-50 rounded-xl border border-gray-100">
        <p className="text-sm text-gray-500">Nema dostupnih podataka o povijesti cijena</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-gray-700">
          📈 Povijest cijena
        </h3>
        <div className="flex flex-wrap gap-2">
          {/* Price type toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => setPriceType("min")}
              className={`px-3 py-1.5 font-medium ${
                priceType === "min"
                  ? "bg-blue-500 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Min
            </button>
            <button
              onClick={() => setPriceType("avg")}
              className={`px-3 py-1.5 font-medium ${
                priceType === "avg"
                  ? "bg-blue-500 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Prosjek
            </button>
          </div>
          {/* Time range selector */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {TIME_RANGES.map((range) => (
              <button
                key={range.days}
                onClick={() => setSelectedDays(range.days)}
                className={`px-3 py-1.5 font-medium ${
                  selectedDays === range.days
                    ? "bg-blue-500 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
          />
          <YAxis
            tickFormatter={(v) => `${v}€`}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip
            formatter={(value: number | undefined, name: string | undefined) => {
                const n = name ?? "";
                return [formatPrice(value ?? 0), CHAIN_DISPLAY_NAMES[n] || n];
              }}
            labelFormatter={(label) => `Datum: ${label}`}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              fontSize: "12px",
            }}
          />
          <Legend
            formatter={(value) => CHAIN_DISPLAY_NAMES[value] || value}
            wrapperStyle={{ fontSize: "12px" }}
          />
          {[...chains].map((chainCode) => (
            <Line
              key={chainCode}
              type="monotone"
              dataKey={chainCode}
              stroke={CHAIN_COLORS[chainCode] || "#6366f1"}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
