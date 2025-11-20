export const CANON = ["first_name","last_name","phone","email","state","city","zip","age","notes"];

const MAP = {
  first_name: ["first_name","First Name","first","fname"],
  last_name:  ["last_name","Last Name","last","lname"],
  phone:      ["phone","Phone","phone_number","Phone Number","mobile","Mobile","Phone #"],
  email:      ["email","Email","e-mail"],
  state:      ["state","State","RR State"],
  city:       ["city","City"],
  zip:        ["zip","Zip","zipcode","Zip Code","postal","Postal Code"],
  age:        ["age","Age","DOB","dob","Date of Birth"],
  notes:      ["notes","Notes","beneficiary","beneficiary_name","lead_quality","favorite_hobby","Military Branch","Military Status"]
};

export function resolveHeader(h) {
  const key = String(h || "").trim();
  for (const canon of Object.keys(MAP)) {
    if (MAP[canon].some(v => v.toLowerCase() === key.toLowerCase())) return canon;
  }
  return null;
}
