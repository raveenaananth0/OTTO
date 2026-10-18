import type { Bill } from "./simTypes";
export function subscriptionProvider(bill: Bill) {
  if (/spotify/i.test(bill.payee))
    return {
      name: "Spotify",
      url: "https://support.spotify.com/article/cancel-premium/",
      monogram: "S",
      color: "#16804a",
    };
  if (/netflix/i.test(bill.payee))
    return {
      name: "Netflix",
      url: "https://www.netflix.com/cancelplan",
      monogram: "N",
      color: "#b52c36",
    };
  return null;
}
