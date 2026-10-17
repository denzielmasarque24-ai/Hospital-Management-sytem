import { redirect } from "next/navigation";

export default function ProductsRedirect() {
  redirect("/admin/inventory");
}
