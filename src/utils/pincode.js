export async function lookupPincode(pincode) {
  if (!/^\d{6}$/.test(pincode)) return null;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const [data] = await res.json();
    if (data?.Status !== "Success" || !data.PostOffice?.length) return null;
    const po = data.PostOffice[0];
    return { city: po.District, state: po.State };
  } catch {
    return null;
  }
}