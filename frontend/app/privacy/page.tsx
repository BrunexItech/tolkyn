import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell, LegalSection } from "@/components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Tolkyn collects, uses and protects personal data.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      intro={
        <>
          This Privacy Policy explains how <strong>Tolkyn</strong> (&ldquo;Tolkyn&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, shares and protects personal data when you use the
          Tolkyn platform. It should be read together with our <Link href="/terms">Terms of Service</Link>.
        </>
      }
    >
      <LegalSection n={1} title="Who is responsible for your data">
        <p>
          For data about you as an account holder, Tolkyn is the data controller. For data you bring
          into the platform about your own contacts, leads and message recipients (&ldquo;Customer
          Data&rdquo;), <strong>you</strong> are the controller and Tolkyn is your processor, acting on
          your instructions to provide the platform.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Data we collect">
        <ul>
          <li>
            <strong>Account data:</strong> name, email, phone, password hash, role, workspace,
            profile details, preferences, and login metadata (timestamps, IP address).
          </li>
          <li>
            <strong>Connected-account data:</strong> access tokens, page/profile identifiers, handles
            and basic profile information for the social, messaging and other accounts you connect.
          </li>
          <li>
            <strong>Messaging data:</strong> the content, timestamps, sender/recipient identifiers
            and delivery status of messages sent and received through the platform, including
            WhatsApp conversations, SMS, social comments, mentions and DMs, and campaign-group
            activity. For WhatsApp we store the WhatsApp identity (which may be a privacy identifier
            rather than a phone number) needed to route replies.
          </li>
          <li>
            <strong>Contacts and CRM data:</strong> the contact, lead and customer records you import
            or create, including names, phone numbers, companies, notes and status.
          </li>
          <li>
            <strong>Content:</strong> posts, drafts, media, AI prompts and generated output,
            campaigns and analytics.
          </li>
          <li>
            <strong>Call-centre data:</strong> call metadata (numbers, direction, duration, outcome,
            notes) and, where enabled, recordings.
          </li>
          <li>
            <strong>Technical data:</strong> device/browser information, log data and cookies or
            local storage strictly needed to keep you signed in and remember interface preferences.
          </li>
          <li>
            <strong>Legal records:</strong> the date, version and IP address recorded when you accept
            these documents.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={3} title="How we use data">
        <ul>
          <li>to provide, operate, secure and support the platform and its features;</li>
          <li>to route, schedule, send, receive and display messages and content on your behalf;</li>
          <li>to classify inbound messages, detect leads and populate your CRM;</li>
          <li>to authenticate you, prevent abuse and enforce our Terms;</li>
          <li>to generate analytics for your workspace;</li>
          <li>to communicate with you about the service;</li>
          <li>to comply with legal obligations and record your acceptance of our terms.</li>
        </ul>
        <p>
          We do not sell personal data. We do not use the content of your messages or Customer Data to
          train our own models.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Legal bases">
        <p>
          Where applicable data-protection law requires a legal basis, we rely on: performance of our
          contract with you; your consent (for example, connecting a WhatsApp number for automation);
          our legitimate interests in operating and securing the platform; and compliance with legal
          obligations. You are responsible for having a valid legal basis and any required consent for
          the Customer Data you process through the platform, including messaging recipients.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Sharing and sub-processors">
        <p>We share data only as needed to run the platform:</p>
        <ul>
          <li>
            <strong>Infrastructure and hosting</strong> providers that store and serve platform data.
          </li>
          <li>
            <strong>Third-party platforms you connect</strong> — Meta / Facebook / Instagram,
            WhatsApp, X, TikTok, YouTube, LinkedIn — which receive the content and requests you direct
            to them.
          </li>
          <li>
            <strong>Messaging and telephony providers</strong> used to deliver SMS, calls and, where
            configured, WhatsApp.
          </li>
          <li>
            <strong>AI providers</strong> that process the prompts and inputs you submit to
            content/video features.
          </li>
          <li>
            Professional advisers, or authorities where required by law, and an acquirer in the event
            of a corporate transaction.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={6} title="International transfers">
        <p>
          Data may be processed in countries other than yours, including where our infrastructure and
          sub-processors operate. Where required, we use appropriate safeguards for such transfers.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Retention">
        <p>
          We keep personal data for as long as your account is active and as needed to provide the
          platform, then delete or anonymise it within a reasonable period, unless a longer period is
          required for legal, security or dispute-resolution purposes. You can delete most Customer
          Data yourself from within the platform.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Security">
        <p>
          We use technical and organisational measures including encryption in transit, hashed
          credentials, scoped service-to-service authentication, access controls, rate limiting and
          security headers. No system is perfectly secure; you are responsible for your credentials
          and for the security of the connected accounts and numbers you link.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Your rights">
        <p>
          Depending on your location you may have rights to access, correct, delete, export or
          restrict processing of your personal data, and to object or withdraw consent. For account
          data, contact us using the details below. For Customer Data held on behalf of a workspace,
          contact that workspace&rsquo;s administrator, who is the controller.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Children">
        <p>The platform is not directed to children and is intended for use by adults only.</p>
      </LegalSection>

      <LegalSection n={11} title="Changes">
        <p>
          We may update this Policy. Material changes update the effective date and require your
          acceptance before you continue using the platform.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Contact">
        <p>
          Privacy questions or requests: <strong>[CONTACT EMAIL]</strong>, Tolkyn,
          [REGISTERED ADDRESS].
        </p>
      </LegalSection>
    </LegalShell>
  );
}
