import { NextRequest, NextResponse } from "next/server";
import {
  fetchArchiveList,
  fetchDayData,
  getTodayDate,
} from "@/lib/cijene";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const barcode = searchParams.get("barcode") || "";
  const productName = searchParams.get("name") || "";
  const city = searchParams.get("city") || "Zagreb";
  const chain = searchParams.get("chain") || "";
  const days = parseInt(searchParams.get("days") || "30");

  if (!barcode && !productName) {
    return NextResponse.json({ error: "barcode or name required" }, { status: 400 });
  }

  try {
    const archives = await fetchArchiveList();
    // Limit to requested number of days
    const recentArchives = archives.slice(0, Math.min(days, archives.length));

    const historyData: {
      date: string;
      prices: { chain: string; minPrice: number; avgPrice: number }[];
    }[] = [];

    // Process archives in parallel (but limit concurrency)
    const batchSize = 5;
    for (let i = 0; i < recentArchives.length; i += batchSize) {
      const batch = recentArchives.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (archive) => {
          const data = await fetchDayData(archive.date);

          // Find matching products
          const matchingProducts = data.products.filter((p) => {
            if (barcode) {
              return p.barcode === barcode;
            }
            return p.name.toLowerCase().includes(productName.toLowerCase());
          });

          if (matchingProducts.length === 0) return null;

          // Filter stores by city
          const cityStores = city
            ? data.stores.filter((s) =>
                s.city.toLowerCase().includes(city.toLowerCase())
              )
            : data.stores;
          const cityStoreIds = new Set(
            cityStores.map((s) => `${s.chain}:${s.store_id}`)
          );

          // Get prices for matching products
          const chainPrices = new Map<
            string,
            { prices: number[]; chain: string }
          >();

          for (const product of matchingProducts) {
            if (chain && product.chain !== chain) continue;

            const productPrices = data.prices.filter(
              (p) =>
                p.chain === product.chain &&
                p.product_id === product.product_id &&
                (city ? cityStoreIds.has(`${p.chain}:${p.store_id}`) : true)
            );

            for (const priceEntry of productPrices) {
              if (!chainPrices.has(product.chain)) {
                chainPrices.set(product.chain, {
                  prices: [],
                  chain: product.chain,
                });
              }
              chainPrices.get(product.chain)!.prices.push(priceEntry.price);
            }
          }

          const prices = [...chainPrices.values()].map(({ chain, prices }) => ({
            chain,
            minPrice: Math.min(...prices),
            avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
          }));

          return { date: archive.date, prices };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          historyData.push(result.value);
        }
      }
    }

    // Sort by date ascending
    historyData.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      history: historyData,
      barcode,
      productName,
      city,
      chain,
    });
  } catch (error) {
    console.error("History error:", error);
    return NextResponse.json(
      { error: "Greška pri dohvaćanju povijesti cijena" },
      { status: 500 }
    );
  }
}
