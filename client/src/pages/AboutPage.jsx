// Static About page: project description, the species list, citations, and links.
import React from 'react';
import NavBar from '../components/NavBar';
import GlassCard from '../components/GlassCard';
import { useTheme } from '../ThemeContext';

const SPECIES = [
  'Haloferax volcanii',
  'Pyrococcus furiosus',
  'Sulfolobus acidocaldarius',
  'Halobacterium salinarum',
  'Thermoplasma acidophilum',
  'Archaeoglobus fulgidus',
  'Methanothermococcus thermolithotrophicus',
  'Sulfolobus islandicus',
];

const GITHUB_ORG = 'https://github.com/arcpp';
const GITHUB_DOWNLOADS = 'https://github.com/arcpp/ArcPP';
const NATURE_2020 = 'https://www.nature.com/articles/s41467-020-16784-7';
const PLOS_2021 = 'https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.3001277';
const CONTACT_EMAIL = 'archaealproteomeproject@gmail.com';

export default function AboutPage() {
  const { isDark } = useTheme();

  const pageBg = { minHeight: '100vh', background: isDark ? '#0b1320' : '#f4f7f8' };
  const titleColor = isDark ? '#e6edf7' : '#13212f';
  const bodyColor = isDark ? '#c8d8e8' : '#3a4a5a';
  const mutedColor = isDark ? '#9cb0c4' : '#5f7282';
  const link = {
    color: isDark ? '#a9c9df' : '#325f86',
    textDecoration: 'underline',
    textDecorationThickness: '1px',
    textUnderlineOffset: '2px',
  };

  const para = { fontSize: 15, lineHeight: 1.7, color: bodyColor, marginBottom: 14 };
  const italic = { fontStyle: 'italic' };

  return (
    <div style={pageBg}>
      <NavBar />

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '40px 24px 64px' }}>
        <header style={{ marginBottom: 22 }}>
          <h1 style={{
            fontSize: 42, fontWeight: 700, color: titleColor,
            margin: 0, fontFamily: 'Newsreader, Georgia, serif', lineHeight: 1.1,
          }}>
            About
          </h1>
          <p style={{ color: mutedColor, marginTop: 8, fontSize: 15 }}>
            The Archaeal Proteome Project (ArcPP) &mdash; community proteomics for archaea.
          </p>
        </header>

        <GlassCard style={{ padding: '28px 32px' }} variant={isDark ? 'dark' : 'light'}>
          <p style={{ ...para, fontSize: 16 }}>
            The <strong>Archaeal Proteome Project (ArcPP)</strong> is a community effort
            that works towards a comprehensive analysis of archaeal proteomes.
          </p>

          <p style={para}>
            Modern proteomics approaches can explore whole proteomes within a single mass
            spectrometry (MS) run. However, the enormous amount of MS data generated often
            remains incompletely analyzed due to a lack of sophisticated bioinformatic tools
            and expertise needed from a diverse array of fields. In particular, in the field
            of microbiology, efforts to combine large-scale proteomic datasets have so far
            largely been missing. Thus, despite their relatively small genomes, the proteomes
            of most archaea remain incompletely characterized. This in turn undermines our
            ability to gain a greater understanding of archaeal cell biology.
          </p>

          <p style={para}>
            Therefore, we have initiated the ArcPP, which collects a diverse set of MS datasets,
            using state-of-the-art bioinformatic tools for comprehensive analysis and expert
            knowledge from a broad range of fields for the interpretation of results. ArcPP
            currently houses data for 8 different archaeal species:{' '}
            {SPECIES.map((name, i) => (
              <React.Fragment key={name}>
                <span style={italic}>{name}</span>
                {i < SPECIES.length - 2 ? ', ' : i === SPECIES.length - 2 ? ', and ' : '.'}
              </React.Fragment>
            ))}
          </p>

          <p style={{ ...para, marginTop: 22, marginBottom: 8 }}>
            You can explore these results through our interactive web database or various
            other ways:
          </p>
          <ul style={{ paddingLeft: 22, margin: 0, marginBottom: 18, color: bodyColor, fontSize: 15, lineHeight: 1.8 }}>
            <li>
              All result files can be downloaded for further processing{' '}
              <a href={GITHUB_DOWNLOADS} target="_blank" rel="noopener noreferrer" style={link}>here</a>.
            </li>
            <li>
              All scripts used for the analysis are available on{' '}
              <a href={GITHUB_ORG} target="_blank" rel="noopener noreferrer" style={link}>GitHub</a>.
              Information about future plans can also be found here.
            </li>
            <li>
              This work has been published in:{' '}
              <a href={NATURE_2020} target="_blank" rel="noopener noreferrer" style={link}>
                Schulze et al. (2020) Nature Communications 11
              </a>.
            </li>
            <li>
              The identification of the largest archaeal glycoproteome is described in:{' '}
              <a href={PLOS_2021} target="_blank" rel="noopener noreferrer" style={link}>
                Schulze et al. (2021) PLOS Biology
              </a>.
            </li>
          </ul>

          <p style={para}>
            With this established bioinformatic infrastructure, we have set the stage for
            further analyses, including proteogenomics as well as the characterization of
            various post-translational modifications. Furthermore, ArcPP will integrate
            quantitative results obtained from the individual datasets in order to identify
            common regulatory mechanisms.
          </p>
        </GlassCard>

        <GlassCard
          style={{ padding: '22px 28px', marginTop: 22 }}
          variant={isDark ? 'dark' : 'light'}
        >
          <h2 style={{
            fontSize: 18, fontWeight: 700, color: titleColor,
            margin: '0 0 10px', fontFamily: 'Newsreader, Georgia, serif',
          }}>
            Get in touch
          </h2>
          <p style={para}>
            If you want to contribute to this community effort, please{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={link}>contact us</a>{' '}
            and check out our{' '}
            <a href={GITHUB_ORG} target="_blank" rel="noopener noreferrer" style={link}>GitHub</a>{' '}
            page.
          </p>
          <p style={{ ...para, marginBottom: 0 }}>
            Please contact us with any questions, contributions, or issues. Feel free to open
            issues and pull requests on our{' '}
            <a href={GITHUB_ORG} target="_blank" rel="noopener noreferrer" style={link}>GitHub</a>{' '}
            page, or reach us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={link}>{CONTACT_EMAIL}</a>.
          </p>
        </GlassCard>
      </main>
    </div>
  );
}
