import { Hero } from '@/app/components/landing/Hero'
import { SearchChanged } from '@/app/components/landing/SearchChanged'
import { ConcreteExample } from '@/app/components/landing/ConcreteExample'
import { WhatAILooksAt } from '@/app/components/landing/WhatAILooksAt'
import { ToolSection } from '@/app/components/landing/ToolSection'
import { ReportExample } from '@/app/components/landing/ReportExample'
import { Premium } from '@/app/components/landing/Premium'
import { FaqSection } from '@/app/components/landing/FaqSection'
import { Footer } from '@/app/components/landing/Footer'

export default function Home() {
  return (
    <>
      <Hero />
      <SearchChanged />
      <ConcreteExample />
      <WhatAILooksAt />
      <ToolSection />
      <ReportExample />
      <Premium />
      <FaqSection />
      <Footer />
    </>
  )
}
