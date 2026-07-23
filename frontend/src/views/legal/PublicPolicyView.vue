<template>
  <div class="min-h-screen bg-gray-50 text-gray-800 dark:bg-dark-950 dark:text-dark-100">
    <header class="border-b border-gray-200 bg-white dark:border-dark-800 dark:bg-dark-900">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <router-link to="/home" class="flex items-center gap-3">
          <img :src="siteLogo || '/logo.png'" :alt="siteName" class="h-9 w-9 rounded-lg object-contain" />
          <span class="text-lg font-semibold text-gray-900 dark:text-white">{{ siteName }}</span>
        </router-link>
        <router-link
          to="/home"
          class="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
        >
          Back to home
        </router-link>
      </div>
    </header>

    <main class="mx-auto max-w-4xl px-6 py-12">
      <article class="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm sm:p-10 dark:border-dark-800 dark:bg-dark-900">
        <p class="mb-2 text-sm font-medium uppercase tracking-wide text-primary-600 dark:text-primary-400">
          Legal
        </p>
        <h1 class="text-3xl font-bold text-gray-900 sm:text-4xl dark:text-white">
          {{ policy.title }}
        </h1>
        <p class="mt-3 text-sm text-gray-500 dark:text-dark-400">
          Effective date: July 23, 2026 · Last updated: July 23, 2026
        </p>

        <div class="mt-8 rounded-xl border border-primary-100 bg-primary-50/60 p-4 text-sm leading-6 text-gray-700 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-dark-200">
          {{ policy.intro }}
        </div>

        <div class="mt-10 space-y-9">
          <section v-for="(section, index) in policy.sections" :key="section.title">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
              {{ index + 1 }}. {{ section.title }}
            </h2>
            <p
              v-for="paragraph in section.paragraphs"
              :key="paragraph"
              class="mt-3 whitespace-pre-line text-sm leading-7 text-gray-600 dark:text-dark-300"
            >
              {{ paragraph }}
            </p>
            <ul v-if="section.items" class="mt-3 list-disc space-y-2 pl-6 text-sm leading-7 text-gray-600 dark:text-dark-300">
              <li v-for="item in section.items" :key="item">{{ item }}</li>
            </ul>
          </section>
        </div>

        <section class="mt-10 border-t border-gray-200 pt-8 dark:border-dark-800">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Contact</h2>
          <p class="mt-3 text-sm leading-7 text-gray-600 dark:text-dark-300">
            Questions or requests concerning this policy may be sent to
            <a
              href="mailto:contact@righttoken.ai"
              class="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
            >
              contact@righttoken.ai
            </a>
            <template v-if="secondaryContact">
              . An additional support channel is available at
              <span class="font-medium text-gray-900 dark:text-white">{{ secondaryContact }}</span>
            </template>
            .
          </p>
        </section>
      </article>
    </main>

    <footer class="border-t border-gray-200 bg-white dark:border-dark-800 dark:bg-dark-900">
      <div class="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-8 text-center text-xs text-gray-500 dark:text-dark-400">
        <nav class="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <router-link v-for="link in legalLinks" :key="link.to" :to="link.to" class="hover:text-primary-600">
            {{ link.label }}
          </router-link>
        </nav>
        <p>
          RightToken is an independent service and is not affiliated with, endorsed by, or sponsored
          by OpenAI, Anthropic, Google, or their affiliates.
        </p>
        <p>&copy; {{ currentYear }} {{ siteName }}. All rights reserved.</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores'
import { sanitizeUrl } from '@/utils/url'

type PolicySection = {
  title: string
  paragraphs: string[]
  items?: string[]
}

type Policy = {
  title: string
  intro: string
  sections: PolicySection[]
}

const policies: Record<string, Policy> = {
  terms: {
    title: 'Terms of Service',
    intro:
      'These Terms of Service govern access to and use of RightToken, an independently operated AI API gateway and prepaid usage-credit platform. By creating an account, purchasing credits, or using the service, you agree to these Terms.',
    sections: [
      {
        title: 'Service and independent status',
        paragraphs: [
          'RightToken provides technical access, routing, usage metering, account management, and related tools for supported artificial-intelligence services. RightToken is an independent service and is not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, Google, or any other model provider.',
          'Names and trademarks of third parties are used only to identify compatible services. Availability, capabilities, pricing, and model names may change when upstream providers change their services.'
        ]
      },
      {
        title: 'Eligibility and accounts',
        paragraphs: [
          'You must have legal capacity to enter into a binding agreement and must comply with the laws applicable in your location. You are responsible for providing accurate registration information, protecting your password and API keys, and all activity performed through your account.',
          'You may not sell, share, or transfer an account in a way that circumvents security, usage limits, sanctions, or applicable law. Notify support promptly if you believe your account or API key has been compromised.'
        ]
      },
      {
        title: 'Credits, pricing, and payment',
        paragraphs: [
          'Payments purchase RightToken service credits or subscriptions; they do not purchase cryptocurrency, investments, financial products, or ownership in RightToken. Credits are a limited contractual right to consume eligible services and are not legal tender, transferable money, or a stored-value financial account.',
          'Prices, exchange-rate calculations, taxes, processing charges, network fees, model multipliers, and usage rates are shown at checkout or in the applicable product interface. Usage is measured by RightToken records. You must review the amount, currency, blockchain network, and destination before making a payment.'
        ]
      },
      {
        title: 'Acceptable use',
        paragraphs: [
          'Your use is subject to the Acceptable Use Policy and any applicable upstream-provider rules. You must not use RightToken for unlawful activity, fraud, abuse, security attacks, harmful automation, rights infringement, or attempts to bypass technical or account restrictions.'
        ]
      },
      {
        title: 'Availability and changes',
        paragraphs: [
          'The service is provided on an “as available” basis. Maintenance, network conditions, upstream outages, rate limits, regulatory requirements, or security events may interrupt or alter access. We may add, replace, limit, or discontinue features or models when reasonably necessary.',
          'We do not guarantee that a particular third-party model or endpoint will remain available or produce a particular result. You are responsible for reviewing AI-generated output before relying on it.'
        ]
      },
      {
        title: 'Suspension and termination',
        paragraphs: [
          'We may restrict, suspend, or terminate access when reasonably necessary to investigate fraud, non-payment, abuse, security risk, legal obligations, sanctions exposure, or a violation of these Terms or the Acceptable Use Policy. Where appropriate, we may request additional verification.'
        ]
      },
      {
        title: 'Intellectual property',
        paragraphs: [
          'RightToken software, branding, interfaces, and original content are protected by applicable intellectual-property laws. These Terms grant only a limited, revocable, non-exclusive right to use the service. You retain responsibility for content you submit and must have the rights necessary to process it.'
        ]
      },
      {
        title: 'Disclaimers and limitation of liability',
        paragraphs: [
          'To the maximum extent permitted by law, RightToken is not liable for indirect, incidental, special, consequential, or punitive damages; loss of profits, data, business, or goodwill; third-party service failures; or decisions made using AI-generated content. Nothing in these Terms excludes liability that cannot legally be excluded.',
          'Your remedies concerning payments are also governed by the Refund Policy.'
        ]
      },
      {
        title: 'Changes and governing requirements',
        paragraphs: [
          'We may update these Terms to reflect service, security, legal, or regulatory changes. Material updates will be posted with a new effective date. Continued use after an update constitutes acceptance to the extent permitted by law. Mandatory consumer protections in your jurisdiction continue to apply.'
        ]
      }
    ]
  },
  privacy: {
    title: 'Privacy Policy',
    intro:
      'This Privacy Policy explains what information RightToken collects, why it is used, when it may be shared, and the choices available to users of our website, dashboard, and API services.',
    sections: [
      {
        title: 'Information we collect',
        paragraphs: ['Depending on how you use RightToken, we may collect:'],
        items: [
          'Account data such as email address, username, authentication records, preferences, and support communications.',
          'Transaction data such as order identifiers, amount, currency, payment status, blockchain transaction identifiers, and limited information returned by payment providers. We do not ask for or store your cryptocurrency private keys.',
          'Service and API data such as API-key identifiers, request time, selected model, token or usage quantities, error information, and routing metadata.',
          'Technical and security data such as IP address, device and browser information, timestamps, logs, cookies, fraud signals, and actions taken within the service.',
          'Content submitted to an API when processing it is necessary to provide the requested service. Retention and handling may also be subject to the applicable upstream provider.'
        ]
      },
      {
        title: 'How we use information',
        paragraphs: ['We use information to:'],
        items: [
          'Create and secure accounts, authenticate requests, and provide requested services.',
          'Meter usage, maintain balances, process orders, deliver credits, and handle refunds.',
          'Detect abuse, fraud, account compromise, sanctions risk, and violations of our policies.',
          'Provide support, service notices, and important account or transaction communications.',
          'Monitor reliability, diagnose errors, improve performance, and comply with legal obligations.'
        ]
      },
      {
        title: 'Legal bases and user choices',
        paragraphs: [
          'Where data-protection law requires a legal basis, processing may be necessary to perform our contract, comply with law, protect legitimate security and operational interests, or act with your consent. You may withdraw consent where applicable without affecting earlier lawful processing.'
        ]
      },
      {
        title: 'Sharing and service providers',
        paragraphs: [
          'We do not sell personal information. We may share information with infrastructure, database, security, analytics, communications, customer-support, payment, and upstream AI service providers only as needed to operate RightToken. Payment providers process payment information under their own privacy terms.',
          'We may also disclose information when required by law, to protect users or the service, to investigate fraud or abuse, or in connection with a corporate restructuring subject to appropriate safeguards.'
        ]
      },
      {
        title: 'Retention and security',
        paragraphs: [
          'We retain information for as long as reasonably necessary to provide the service, maintain financial and security records, resolve disputes, enforce agreements, and meet legal obligations. Retention periods vary by data type and risk.',
          'We use administrative and technical safeguards designed to protect information, but no system can guarantee absolute security. Users are responsible for protecting credentials and avoiding submission of unnecessary sensitive information.'
        ]
      },
      {
        title: 'International processing',
        paragraphs: [
          'RightToken and its providers may process information in countries other than your own. Where required, we use reasonable safeguards for international transfers. By requesting a service involving a third-party provider, your data may be processed where that provider operates.'
        ]
      },
      {
        title: 'Your rights',
        paragraphs: [
          'Subject to applicable law, you may request access, correction, deletion, restriction, objection, portability, or information about processing. We may need to verify your identity and may retain information when required for security, transactions, legal compliance, or dispute resolution.'
        ]
      },
      {
        title: 'Children',
        paragraphs: [
          'RightToken is not directed to children below the minimum age required to consent to online services in their jurisdiction. We do not knowingly collect children’s personal information in violation of applicable law.'
        ]
      },
      {
        title: 'Policy updates',
        paragraphs: [
          'We may update this Privacy Policy as our service or legal obligations change. The latest version and effective date will remain publicly available on this page.'
        ]
      }
    ]
  },
  refund: {
    title: 'Refund Policy',
    intro:
      'This Refund Policy applies to purchases of RightToken service credits and subscriptions. It describes how to request a refund and the factors used to determine eligibility. Mandatory consumer rights under applicable law are not limited by this policy.',
    sections: [
      {
        title: 'Submitting a request',
        paragraphs: [
          'Submit a refund request from the order-history page when that option is available, or contact customer support with your account email, order identifier, payment date, amount, payment method, and reason. Do not disclose passwords, API keys, wallet seed phrases, or private keys.'
        ]
      },
      {
        title: 'Eligibility',
        paragraphs: [
          'Refund eligibility depends on order status, service usage, remaining balance or subscription value, payment-provider capability, fraud and security checks, and applicable law.',
          'Orders requested within 24 hours after payment are sent to manual review rather than automatic refund. At most one eligible automatic refund may be processed within a rolling 30-day period. Additional requests are reviewed manually.',
          'An automatic full refund generally requires sufficient unused balance or recoverable subscription value. If credits or services have already been consumed, we may deny the request or offer a partial refund when technically and commercially reasonable.'
        ]
      },
      {
        title: 'Non-refundable or limited cases',
        paragraphs: ['Except where required by law, a refund may be refused or reduced for:'],
        items: [
          'Credits, subscription time, or services already consumed or transferred into usage.',
          'Blockchain network fees, exchange-rate movements, payment-provider charges, or amounts sent using the wrong asset, network, address, or memo.',
          'Orders associated with fraud, abuse, policy violations, chargeback misuse, sanctions concerns, or inaccurate information.',
          'Promotional, bonus, referral, complimentary, or otherwise non-cash credits.',
          'Service interruptions caused by the user, an unsupported client, or a third party where RightToken delivered the purchased credits or subscription.'
        ]
      },
      {
        title: 'Cryptocurrency payments',
        paragraphs: [
          'Blockchain transactions are generally irreversible. A refund, if approved and supported by the payment provider, may require a verified destination wallet and may be reduced by network or provider fees. Never send funds directly to an old or previously displayed address unless a new order instructs you to do so.'
        ]
      },
      {
        title: 'Processing time and method',
        paragraphs: [
          'Approved refunds are normally returned through the original payment method when supported. RightToken initiates eligible refunds promptly, but banks, card networks, payment providers, and blockchains control final settlement time. Typical processing may take 1–3 business days after provider acceptance and can take longer in exceptional cases.'
        ]
      },
      {
        title: 'Chargebacks and disputes',
        paragraphs: [
          'Contact support before initiating a chargeback or external dispute so we can investigate. Fraudulent or duplicate disputes may result in account restriction. Nothing in this section prevents you from exercising rights that cannot be waived under applicable law.'
        ]
      },
      {
        title: 'Decision and review',
        paragraphs: [
          'We may request information reasonably necessary to verify the transaction and prevent fraud. If a request is denied, you may ask support for a manual review. Refund decisions do not restore credits or subscriptions already consumed.'
        ]
      }
    ]
  },
  acceptableUse: {
    title: 'Acceptable Use Policy',
    intro:
      'This Acceptable Use Policy protects users, providers, and the integrity of RightToken. It applies to all website, dashboard, API, automation, and model usage through the service.',
    sections: [
      {
        title: 'Illegal and harmful activity',
        paragraphs: ['You may not use RightToken to facilitate or promote:'],
        items: [
          'Activity that violates applicable law, court orders, sanctions, export controls, or the rights of another person.',
          'Fraud, scams, phishing, impersonation, deceptive practices, money laundering, terrorist financing, or evasion of identity and payment controls.',
          'Child sexual abuse material, non-consensual intimate content, human exploitation, credible threats, or instructions primarily intended to cause serious physical harm.',
          'Sale or distribution of prohibited drugs, weapons, stolen goods, stolen credentials, or unlawfully obtained personal information.'
        ]
      },
      {
        title: 'Security and platform abuse',
        paragraphs: ['You may not:'],
        items: [
          'Probe, scan, exploit, disrupt, overload, or bypass security, authentication, rate limits, billing, model restrictions, or access controls.',
          'Distribute malware, ransomware, credential-stealing code, destructive payloads, spam, or denial-of-service traffic.',
          'Use automated account creation, stolen payment methods, shared credentials, unauthorized proxies, or other techniques intended to conceal abuse.',
          'Reverse engineer or scrape the service beyond what applicable law or an expressly documented interface permits.'
        ]
      },
      {
        title: 'Content and third-party rights',
        paragraphs: [
          'You must have the rights and permissions necessary for content you submit. Do not use the service to infringe intellectual property, privacy, publicity, confidentiality, or contractual rights, or to generate deceptive content presented as authentic without appropriate disclosure.',
          'Use of a supported model may also be subject to the relevant upstream provider’s policies. A use permitted by one provider may be restricted by another.'
        ]
      },
      {
        title: 'High-impact decisions',
        paragraphs: [
          'Do not rely on unreviewed AI output as the sole basis for decisions that determine a person’s legal rights, medical treatment, access to essential services, employment, credit, housing, insurance, education, or other high-impact outcomes. Qualified human review and applicable safeguards are required.'
        ]
      },
      {
        title: 'Payments and cryptocurrency',
        paragraphs: [
          'RightToken accepts payment only for its services. You may not use the platform to exchange or launder funds, route payments for unrelated third parties, disguise the source or purpose of funds, exploit exchange-rate differences, or conduct an unlicensed financial activity.'
        ]
      },
      {
        title: 'Enforcement',
        paragraphs: [
          'We may investigate suspected violations, limit features, suspend keys or accounts, preserve relevant records, reverse fraudulently obtained credits, require verification, or report conduct when legally required. Enforcement considers severity, intent, history, risk, and whether the user promptly remedied the issue.'
        ]
      },
      {
        title: 'Reporting',
        paragraphs: [
          'Report suspected abuse through the customer-support channel with relevant URLs, request identifiers, timestamps, and a clear description. Do not include passwords, private keys, or unnecessary sensitive personal information.'
        ]
      }
    ]
  }
}

const route = useRoute()
const appStore = useAppStore()

const policy = computed(() => policies[String(route.meta.policy || 'terms')] || policies.terms)
const siteName = computed(() => appStore.siteName || 'RightToken')
const siteLogo = computed(() =>
  sanitizeUrl(appStore.siteLogo || '', { allowRelative: true, allowDataUrl: true })
)
const secondaryContact = computed(() => {
  const value = appStore.contactInfo?.trim()
  return value && value.toLowerCase() !== 'contact@righttoken.ai' ? value : ''
})
const currentYear = new Date().getFullYear()

const legalLinks = [
  { to: '/terms', label: 'Terms of Service' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/refund-policy', label: 'Refund Policy' },
  { to: '/acceptable-use', label: 'Acceptable Use Policy' },
  { to: '/contact', label: 'Contact' }
]
</script>
