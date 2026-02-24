"use client";

import { useState } from "react";
import { CHAIN_COLORS, CHAIN_DISPLAY_NAMES, type ProductWithPrices } from "@/lib/cijene";
import PriceHistoryChart from "./PriceHistoryChart";

interface ProductCardProps {
  product: ProductWithPrices;
  city: string;
}

export default function ProductCard({ product, city }: ProductCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Group prices by chain and get min price per chain
  const chainPrices = new Map<
    string,
    { minPrice: number; maxPrice: number; storeCount: number; stores: string[] }
  >();

  for (const p of product.prices) {
    if (!chainPrices.has(p.chain)) {
      chainPrices.set(p.chain, {
        minPrice: p.price,
        maxPrice: p.price,
        storeCount: 1,
        stores: [p.store.address ? `${p.store.address}, ${p.store.city}` : p.store.city],
      });
    } else {
      const entry = chainPrices.get(p.chain)!;
      entry.minPrice = Math.min(entry.minPrice, p.price);
      entry.maxPrice = Math.max(entry.maxPrice, p.price);
      entry.storeCount++;
      if (entry.stores.length < 3) {
        entry.stores.push(p.store.address ? `${p.store.address}, ${p.store.city}` : p.store.city);
      }
    }
  }

  const sortedChains = [...chainPrices.entries()].sort(
    ([, a], [, b]) => a.minPrice - b.minPrice
  );

  const cheapestPrice = sortedChains[0]?.[1].minPrice;
  const mostExpensivePrice = sortedChains[sortedChains.length - 1]?.[1].minPrice;
  const priceDiff =
    sortedChains.length > 1
      ? (((mostExpensivePrice - cheapestPrice) / cheapestPrice) * 100).toFixed(0)
      : null;

  const formatPrice = (price: number) =>
    price.toLocaleString("hr-HR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Product Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {product.product.brand && (
              <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">
                {product.product.brand}
              </span>
            )}
            <h3 className="text-sm font-semibold text-gray-900 mt-0.5 leading-tight">
              {product.product.name}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {product.product.quantity && product.product.unit && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {product.product.quantity} {product.product.unit}
                </span>
              )}
              {product.product.category && (
                <span className="text-xs text-gray-400">
                  {product.product.category}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-gray-900">
              {formatPrice(cheapestPrice)}
            </div>
            {priceDiff && parseInt(priceDiff) > 0 && (
              <div className="text-xs text-orange-500 font-medium">
                do +{priceDiff}% skuplje
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chain Price Bars */}
      <div className="px-4 pb-3">
        <div className="space-y-2">
          {sortedChains.slice(0, expanded ? undefined : 4).map(([chainCode, data], index) => {
            const isCheapest = index === 0;
            const barWidth =
              cheapestPrice > 0
                ? Math.max(20, (cheapestPrice / data.minPrice) * 100)
                : 100;

            return (
              <div key={chainCode} className="flex items-center gap-2">
                <div
                  className="text-xs font-medium w-20 shrink-0 truncate"
                  style={{ color: CHAIN_COLORS[chainCode] || "#6366f1" }}
                >
                  {CHAIN_DISPLAY_NAMES[chainCode] || chainCode}
                </div>
                <div className="flex-1 relative h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: isCheapest
                        ? "#22c55e"
                        : CHAIN_COLORS[chainCode] || "#6366f1",
                      opacity: 0.85,
                    }}
                  />
                </div>
                <div className="text-xs font-semibold text-gray-700 w-16 text-right shrink-0">
                  {formatPrice(data.minPrice)}
                </div>
                {isCheapest && (
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                    ✓ Najjeftinije
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {sortedChains.length > 4 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs text-blue-500 hover:text-blue-700 font-medium"
          >
            {expanded
              ? "Prikaži manje"
              : `+ ${sortedChains.length - 4} više trgovina`}
          </button>
        )}
      </div>

      {/* Action Buttons */}
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`flex-1 text-xs font-medium py-2 px-3 rounded-lg border transition-colors ${
            showHistory
              ? "bg-blue-500 text-white border-blue-500"
              : "bg-white text-blue-600 border-blue-200 hover:bg-blue-50"
          }`}
        >
          {showHistory ? "Sakrij grafikon" : "📈 Prikaz cijena kroz vrijeme"}
        </button>
        {product.product.barcode && !product.product.barcode.includes(":") && (
          <div className="text-xs text-gray-400 flex items-center px-2">
            EAN: {product.product.barcode}
          </div>
        )}
      </div>

      {/* Price History Chart */}
      {showHistory && (
        <div className="px-4 pb-4">
          <PriceHistoryChart
            barcode={product.product.barcode}
            productName={product.product.name}
            city={city}
          />
        </div>
      )}
    </div>
  );
}
