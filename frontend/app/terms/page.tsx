import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell, LegalSection } from "@/components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of the Tolkyn platform.",
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      intro={
        <>
          These Terms of Service (&ldquo;Terms&rdquo;) are a binding agreement between you (and the
          organisation you represent, together &ldquo;you&rdquo;) and <strong>Tolkyn</strong>,
          operator of the Tolkyn platform (&ldquo;Tolkyn&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account,
          ticking the acceptance box, or using the platform, you agree to these Terms and to our{" "}
          <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not use the platform.
        </>
      }
    >
      <LegalSection n={1} title="The service">
        <p>
          Tolkyn is a workspace for social media management, messaging and customer engagement. It
          includes tools to schedule and publish content, a unified inbox, bulk SMS and WhatsApp
          messaging, &ldquo;community&rdquo; campaign groups, lead generation and CRM, a built-in call
          centre, AI-assisted content and video generation, and analytics. Features may be added,
          changed or removed over time.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Accounts and eligibility">
        <ul>
          <li>You must be at least 18 years old and able to form a binding contract.</li>
          <li>
            You are responsible for the accuracy of your account information, for keeping your
            credentials secure, and for all activity under your account and that of anyone you invite.
          </li>
          <li>
            New accounts require approval by the platform administrator before dashboard access is
            granted. We may decline, suspend or terminate any account at our discretion.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={3} title="WhatsApp automation — your consent and responsibilities">
        <p>
          If you connect a WhatsApp number for automation, you expressly authorise Tolkyn to link
          that WhatsApp account and to send, receive, store and process messages, contacts and
          related metadata on your behalf in order to provide the inbox, automation, broadcast and
          campaign-group features.
        </p>
        <ul>
          <li>
            <strong>Unofficial integration.</strong> The WhatsApp connection uses an unofficial
            integration, not the Meta-provided WhatsApp Business API. WhatsApp may rate-limit,
            restrict or ban a connected number for automated use. That risk falls on the number you
            connect. Use a dedicated number you control, not a primary personal number, and never a
            number you cannot afford to lose access to.
          </li>
          <li>
            <strong>Recipient consent.</strong> You confirm that you have a lawful basis and, where
            required, the prior opt-in consent of every person you message through the platform, and
            that your use complies with the WhatsApp Business Messaging Policy, anti-spam laws, and
            all applicable communications and data-protection laws in your and your recipients&rsquo;
            jurisdictions.
          </li>
          <li>
            <strong>Campaign groups.</strong> In &ldquo;community&rdquo; campaigns, participants&rsquo;
            replies are relayed to other participants under a pseudonym and their phone numbers are
            not shown to each other. You remain the data controller for those participants and are
            responsible for informing them how the group works.
          </li>
          <li>
            <strong>No warranty of delivery or continuity.</strong> We do not guarantee that any
            message will be delivered, that a connection will remain active, or that WhatsApp will not
            change or block the integration.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={4} title="Acceptable use">
        <p>You must not use the platform to:</p>
        <ul>
          <li>send spam, unsolicited bulk messaging, or content to recipients who have not consented or who have opted out;</li>
          <li>send unlawful, fraudulent, deceptive, harassing, hateful, or infringing content, or content that violates a third party&rsquo;s rights;</li>
          <li>impersonate any person or organisation, or misrepresent your affiliation;</li>
          <li>violate the terms, policies or rate limits of any connected third-party service (Meta, WhatsApp, X, TikTok, YouTube, LinkedIn, SMS carriers, AI providers, etc.);</li>
          <li>attempt to gain unauthorised access to the platform, other accounts, or our infrastructure, or probe, scan or test its vulnerability without written permission;</li>
          <li>resell, sublicense or provide the platform to third parties except as expressly permitted.</li>
        </ul>
        <p>
          You are solely responsible for the content you publish and the messages you send, and for
          any consequences of doing so.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Third-party services">
        <p>
          The platform connects to and depends on third-party services. Your use of those services
          through Tolkyn is also subject to their terms. We are not responsible for third-party
          services, their availability, or actions they take against your accounts (including
          suspensions or bans).
        </p>
      </LegalSection>

      <LegalSection n={6} title="Your content and data">
        <ul>
          <li>You retain ownership of the content, contacts and data you bring to or create on the platform (&ldquo;Your Data&rdquo;).</li>
          <li>You grant us a licence to host, process, transmit and display Your Data solely to operate and improve the platform and provide the features you use.</li>
          <li>Our handling of personal data is described in the <Link href="/privacy">Privacy Policy</Link>.</li>
          <li>You are responsible for maintaining your own backups of anything important to you.</li>
        </ul>
      </LegalSection>

      <LegalSection n={7} title="AI-generated content">
        <p>
          Features that generate text, images or video use third-party AI models. Output may be
          inaccurate or unsuitable and is not reviewed by us. You are responsible for reviewing AI
          output before publishing or sending it, and for ensuring it does not infringe third-party
          rights. Usage may be subject to per-account limits and budgets set by the administrator.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Fees">
        <p>
          Where the platform or specific features are offered on a paid basis, applicable fees, billing
          cycle and taxes will be presented to you before purchase. Fees are non-refundable except
          where required by law. We may change pricing on prospective notice.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Availability and changes">
        <p>
          We aim to keep the platform available but do not guarantee uninterrupted or error-free
          operation. We may modify, suspend or discontinue any part of the platform, and we perform
          maintenance that may cause downtime.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Disclaimers">
        <p>
          The platform is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind,
          whether express, implied or statutory, including any implied warranties of merchantability,
          fitness for a particular purpose, non-infringement, or that the platform will meet your
          requirements or operate without interruption or error, to the fullest extent permitted by
          law.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, we will not be liable for any indirect, incidental,
          special, consequential or punitive damages, or for lost profits, revenue, data, goodwill,
          or for any restriction, suspension or ban of any account (including WhatsApp or other
          third-party accounts) arising from your use of the platform. Our total aggregate liability
          for any claim relating to the platform will not exceed the greater of the amounts you paid
          us for the platform in the three months before the event giving rise to the claim, or
          USD 100.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Indemnity">
        <p>
          You will indemnify and hold harmless Tolkyn and its personnel from any claim,
          loss or expense (including reasonable legal fees) arising from your content or messages,
          your use of the platform, or your breach of these Terms or of any law or third-party right.
        </p>
      </LegalSection>

      <LegalSection n={13} title="Suspension and termination">
        <p>
          You may stop using the platform at any time. We may suspend or terminate your access
          immediately if you breach these Terms, if required to protect the platform, other users or
          third parties, or if a connected provider requires it. On termination, your right to use
          the platform ends; we may delete Your Data after a reasonable period.
        </p>
      </LegalSection>

      <LegalSection n={14} title="Changes to these Terms">
        <p>
          We may update these Terms. When we make a material change we will update the effective date
          and require you to accept the new version before continuing to use the platform. Continued
          use after acceptance constitutes agreement.
        </p>
      </LegalSection>

      <LegalSection n={15} title="Governing law">
        <p>
          These Terms are governed by the laws of <strong>[JURISDICTION]</strong>, without regard to
          its conflict-of-laws rules. The courts of <strong>[JURISDICTION]</strong> have exclusive
          jurisdiction over any dispute, except that either party may seek injunctive relief in any
          competent court.
        </p>
      </LegalSection>

      <LegalSection n={16} title="Contact">
        <p>
          Questions about these Terms: <strong>[CONTACT EMAIL]</strong>, Tolkyn,
          [REGISTERED ADDRESS].
        </p>
      </LegalSection>
    </LegalShell>
  );
}
