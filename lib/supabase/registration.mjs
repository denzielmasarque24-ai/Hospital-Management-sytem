export function normalizePhilippineMobile(value) {
  const compact = String(value ?? "").trim().replace(/[\s()-]/g, "");
  if (/^09\d{9}$/.test(compact)) return `+63${compact.slice(1)}`;
  if (/^\+?639\d{9}$/.test(compact)) return `+${compact.replace(/^\+/, "")}`;
  return null;
}

export function buildSignupMetadata(form) {
  return {
    first_name: form.firstName.trim(),
    middle_name: form.middleName?.trim() || null,
    last_name: form.lastName.trim(),
    suffix: form.suffix?.trim() || null,
    gender: form.gender,
    date_of_birth: form.birthday,
    mobile_number: normalizePhilippineMobile(form.mobileNumber),
    username: form.username.trim(),
    terms_accepted: form.acceptedTerms === true,
  };
}

export function validateRegistration(form) {
  const errors = {};
  for (const [key, label] of [["firstName", "first name"], ["lastName", "last name"], ["gender", "gender"], ["birthday", "date of birth"], ["mobileNumber", "mobile number"], ["username", "username"]]) {
    if (!String(form[key] ?? "").trim()) errors[key] = `Please enter your ${label}.`;
  }
  if (form.birthday) {
    const date = new Date(`${form.birthday}T00:00:00Z`);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.birthday) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== form.birthday || form.birthday > today) {
      errors.birthday = "Enter a valid date of birth that is not in the future.";
    }
  }
  if (form.gender && !["Female", "Male", "Other", "Prefer not to say"].includes(form.gender)) errors.gender = "Please select a listed gender option.";
  if (form.username.trim() && !/^[A-Za-z0-9_.-]{3,60}$/.test(form.username.trim())) errors.username = "Use 3–60 letters, numbers, periods, underscores, or hyphens.";
  if (form.mobileNumber.trim() && !normalizePhilippineMobile(form.mobileNumber)) errors.mobileNumber = "Enter a Philippine mobile number such as 0917 123 4567 or +63 917 123 4567.";
  if (!form.email.trim()) errors.email = "Please enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Please enter a valid email address.";
  if (!form.password) errors.password = "Please enter a password.";
  else if (form.password.length < 8) errors.password = "Password must be at least 8 characters.";
  if (!form.confirmPassword) errors.confirmPassword = "Please confirm your password.";
  else if (form.confirmPassword !== form.password) errors.confirmPassword = "Passwords do not match.";
  if (form.acceptedTerms !== true) errors.acceptedTerms = "Please explicitly accept the Terms and Conditions and Privacy Policy to continue.";
  return errors;
}

export async function isUsernameAvailable(client, username) {
  const name = username.trim();
  const result = await client.rpc("is_username_available", { p_username: name });
  if (!result.error) {
    if (typeof result.data !== "boolean") throw new Error("USERNAME_CHECK_UNAVAILABLE");
    return result.data;
  }
  if (result.error.code !== "PGRST202" && result.error.code !== "42883") throw result.error;
  // Compatibility with the current deployment until the scoped RPC is applied.
  // This is only a preflight; a database unique index must settle signup races.
  const escaped = name.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await client.from("profiles").select("username").ilike("username", escaped).limit(1);
  if (error) throw new Error("USERNAME_CHECK_UNAVAILABLE");
  return (data ?? []).length === 0;
}

export function getRegistrationError(error) {
  const message = (error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  if (message.includes("username") && /duplicate|already|taken|unique/.test(message)) return "That username is already in use. Please choose another.";
  if (message.includes("already registered") || message.includes("already exists") || code === "user_already_exists") return "If you already have an account, log in or use Forgot password on the login page.";
  if (message.includes("invalid email") || code.includes("email_address_invalid")) return "Please enter a valid email address.";
  if (message.includes("weak password") || message.includes("password should be")) return "Choose a stronger password that meets the account requirements.";
  if (code === "23505" || message.includes("duplicate key")) return "That email or username is already in use. Please use a different one.";
  if (message.includes("username_check_unavailable")) return "Username availability could not be checked. Please try again or contact the hospital.";
  if (message.includes("metadata") || message.includes("invalid input syntax") || code === "validation_failed" || code === "bad_json") return "Some registration details were rejected. Check your name, birth date, gender, mobile number, and username, then try again.";
  if (message.includes("database error saving new user") || message.includes("trigger") || code === "unexpected_failure") return "The registration service could not create your patient profile. Please contact the hospital if your details are correct; your signup may not have completed.";
  if (error?.status === 429) return "Too many registration attempts. Wait a moment and try again.";
  if (message.includes("fetch") || message.includes("network")) return "We could not reach the registration service. Check your connection and try again.";
  return "We could not create your account. Please review your details and try again.";
}
