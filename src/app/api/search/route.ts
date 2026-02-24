import { NextRequest, NextResponse } from "next/server";
import {
  searchProductsEfficient,
  getTodayDate,
  fetchArchiveList,
} from "@/lib/cijene";
import {
  isDateIngested,
  getLatestIngestedDate,
  searchProductsFromDB,
} from "@/lib/db-queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q") || "";
  const city = searchParams.get("city") || "Zagreb";
  const date = searchParams.get("date") || getTodayDate();

  if (!query.trim()) {
    return NextResponse.json({ products: [], date });
  }

  try {
    // Try to get data for the requested date, fall back to most recent
    let actualDate = date;

    // First, check if we have this date in the database
    const dbHasDate = await isDateIngested(actualDate).catch(() => false);

    if (dbHasDate) {
      // Fast path: query the database
      const products = await searchProductsFromDB(actualDate, query, city);
      return NextResponse.json({
        products,
        date: actualDate,
        city,
        total: products.length,
        source: "db",
      });
    }

    // Check if there's any ingested data at all (use latest ingested date)
    const latestIngestedDate = await getLatestIngestedDate().catch(() => null);
    if (latestIngestedDate) {
      const products = await searchProductsFromDB(latestIngestedDate, query, city);
      return NextResponse.json({
        products,
        date: latestIngestedDate,
        city,
        total: products.length,
        source: "db",
      });
    }

    // Fallback: use ZIP range requests (slower but always works)
    try {
      const archives = await fetchArchiveList();
      const availableDates = archives.map((a) => a.date);
      if (!availableDates.includes(actualDate)) {
        actualDate = availableDates[0]; // Most recent
      }
    } catch {
      // Continue with requested date
    }

    const products = await searchProductsEfficient(actualDate, query, city);

    return NextResponse.json({
      products,
      date: actualDate,
      city,
      total: products.length,
      source: "zip",
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Greška pri dohvaćanju podataka", products: [], date },
      { status: 500 }
    );
  }
}
