import CheckoutWizard from './CheckoutWizard';

export default async function CheckoutPage({ params }) {
  const { token } = await params;
  return <CheckoutWizard token={token} />;
}
