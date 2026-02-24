import { NextRequest, NextResponse } from "next/server";
import {
  fetchDayData,
  searchProducts,
  getTodayDate,
  fetchArchiveList,
} from "@/lib/cijene";

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
    try {
      const archives = await fetchArchiveList();
      const availableDates = archives.map((a) => a.date);
      if (!availableDates.includes(date)) {
        actualDate = availableDates[0]; // Most recent
      }
    } catch {
      // Continue with requested date
    }

    const data = await fetchDayData(actualDate);
    const products = searchProducts(data, query, city);

    return NextResponse.json({
      products,
      date: actualDate,
      city,
      total: products.length,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Greška pri dohvaćanju podataka", products: [], date },
      { status: 500 }
    );
  }
}
