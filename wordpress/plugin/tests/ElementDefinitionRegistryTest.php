<?php
/** Generated definition registry tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Frontend\MarqueeCss;
use Blixis\Builder\Preview\PreviewSanitizer;
use Blixis\Builder\Registry\ElementDefinitionRegistry;
use Blixis\Builder\Render\AssetReferenceResolver;
use Blixis\Builder\Render\CoreDocumentRenderer;
use Blixis\Builder\Render\DefinitionArchetypeRenderer;
use Blixis\Builder\Render\ElementNode;
use Blixis\Builder\Render\MediaResolver;
use Blixis\Builder\Render\PlayableMediaResolver;
use Blixis\Builder\Render\WordPressMediaResolver;
use Blixis\Builder\Render\RenderContext;
use Blixis\Builder\Render\TextTrackResolver;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Tests for generated element definition metadata. */
final class ElementDefinitionRegistryTest extends TestCase {
	/** Loads every generated definition and resolves legacy namespaced ids. */
	public function test_generated_catalog_loads_and_namespaced_ids_resolve(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$this->assertCount( 253, $registry->all() );
		$this->assertSame( 'heading', $registry->get( 'blixis/heading' )['id'] ?? null );
		$this->assertSame( 'ready', $registry->get( 'heading' )['status'] ?? null );
		$this->assertSame( 'ready', $registry->get( 'grid' )['status'] ?? null );
		$this->assertSame( 'ready', $registry->get( 'avatar' )['status'] ?? null );
		$this->assertSame( 'ready', $registry->get( 'post-title' )['status'] ?? null );
	}

	/** The document renderer keeps a configured safe local icon glyph instead of silently using the default. */
	public function test_document_render_preserves_local_icon_reference(): void {
		$document = json_decode( '{"root":[{"id":"icon-svg1","type":"blixis/icon-svg","props":{"icon":"solar:info-circle-linear","size":48,"decorative":true},"children":[]}]}' );
		$html     = ( new CoreDocumentRenderer( \Blixis\Builder\Registry\ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ), new WordPressMediaResolver() ) )->render( $document, 'en_US', 'light' );
		$this->assertStringContainsString( 'data-blx-icon="solar:info-circle-linear"', $html );
		$this->assertStringContainsString( 'width="48" height="48"', $html );
		$this->assertTrue( PreviewSanitizer::accepts( $html ) );
	}

	/** Static WordPress text elements render their escaped fallback when no post context is present. */
	public function test_static_wordpress_text_elements_render_safe_fallbacks(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$media    = new class() implements AssetReferenceResolver {
			/** Resolve no attachment in this text renderer test.
			 *
			 * @param int $attachment_id Attachment ID.
			 */
			public function resolve( int $attachment_id ): ?array {
				return null;
			}
			/** Resolve no imported asset in this text renderer test.
			 *
			 * @param string $reference Asset reference.
			 */
			public function resolve_reference( string $reference ): ?array {
				return null;
			}
		};
		$renderer = new DefinitionArchetypeRenderer( $registry, $media );
		foreach ( [ 'post-title', 'post-excerpt', 'post-date', 'post-author', 'post-terms', 'site-tagline' ] as $type ) {
			$this->assertSame(
				'<span data-blx-id="dynamic-1" data-blx-type="blixis/' . $type . '">Fallback &amp; title</span>',
				$renderer->render(
					new ElementNode( 'dynamic-1', 'blixis/' . $type, [ 'fallback' => 'Fallback & title' ] ),
					new RenderContext()
				)
			);
		}
		$this->assertSame(
			'<div data-blx-id="dynamic-1" data-blx-type="blixis/post-content">Fallback &amp; title</div>',
			$renderer->render(
				new ElementNode( 'dynamic-1', 'blixis/post-content', [ 'fallback' => 'Fallback & title' ] ),
				new RenderContext()
			)
		);
	}

	/** Resizable panels preserve child order and expose a labeled keyboard separator. */
	public function test_resizable_panels_render_keyboard_separator_markup(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$media    = new class() implements AssetReferenceResolver {
			/** Resolve no attachment for layout renderer tests.
			 *
			 * @param int $attachment_id Attachment ID.
			 */
			public function resolve( int $attachment_id ): ?array {
				return null;
			}
			/** Resolve no imported asset for layout renderer tests.
			 *
			 * @param string $reference Asset reference.
			 */
			public function resolve_reference( string $reference ): ?array {
				return null;
			}
		};
		$renderer = new DefinitionArchetypeRenderer( $registry, $media );
		$html     = $renderer->render(
			new ElementNode(
				'panels-1',
				'blixis/resizable-panels',
				[
					'orientation'  => 'horizontal',
					'minPanelSize' => 20,
				]
			),
			new RenderContext( '', null, [ '<p>First panel</p>', '<p>Second panel</p>' ] )
		);
		$this->assertStringContainsString( 'data-blx-resizable-panels="horizontal"', $html );
		$this->assertStringContainsString( '<p>First panel</p>', $html );
		$this->assertStringContainsString( '<p>Second panel</p>', $html );
		$this->assertStringContainsString( 'role="separator" aria-label="Resize panel" aria-orientation="vertical"', $html );
		$this->assertStringContainsString( 'aria-valuemin="20" aria-valuemax="80" aria-valuenow="50" tabindex="0"', $html );
	}

	/** Marquees expose a pause control and keep duplicate content inert and ID-free. */
	public function test_marquee_render_is_accessible_and_avoids_duplicate_ids(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$media    = new class() implements AssetReferenceResolver {
			/** Resolve no attachment for layout renderer tests.
			 *
			 * @param int $attachment_id Attachment ID.
			 */
			public function resolve( int $attachment_id ): ?array {
				return null;
			}
			/** Resolve no imported asset for layout renderer tests.
			 *
			 * @param string $reference Asset reference.
			 */
			public function resolve_reference( string $reference ): ?array {
				return null;
			}
		};
		$renderer = new DefinitionArchetypeRenderer( $registry, $media );
		$html     = $renderer->render(
			new ElementNode(
				'marquee-1',
				'blixis/marquee-layout',
				[
					'direction' => 'right',
					'duration'  => 45,
				]
			),
			new RenderContext( '<p id="inside">Moving content</p>' )
		);
		$this->assertStringContainsString( 'data-blx-marquee="right" data-blx-marquee-duration="45"', $html );
		$this->assertStringContainsString( 'aria-label="Pause scrolling" aria-pressed="false">Pause scrolling</button>', $html );
		$this->assertStringContainsString( '<div data-blx-marquee-group aria-hidden="true" inert><p>Moving content</p></div>', $html );
		$this->assertSame( 1, substr_count( $html, 'id="inside"' ) );
		$css = MarqueeCss::css();
		$this->assertStringContainsString( '@media(prefers-reduced-motion:reduce)', $css );
		$this->assertStringContainsString( '@keyframes blx-marquee-left', $css );
	}

	/** Newly supported P2 content elements keep text escaped and native controls accessible. */
	public function test_p2_content_elements_render_safe_semantic_output(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$media    = new class() implements AssetReferenceResolver {
			/** Resolve no attachment for P2 content tests.
			 *
			 * @param int $attachment_id Attachment ID.
			 */
			public function resolve( int $attachment_id ): ?array {
				return null;
			}
			/** Resolve no imported asset for P2 content tests.
			 *
			 * @param string $reference Asset reference.
			 */
			public function resolve_reference( string $reference ): ?array {
				return null;
			}
		};
		$renderer = new DefinitionArchetypeRenderer( $registry, $media );
		$code     = $renderer->render(
			new ElementNode(
				'code-1',
				'blixis/syntax-highlighter',
				[
					'code'     => 'const x = "<safe>";',
					'language' => 'js',
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( 'data-blx-code-token="keyword">const</span>', $code );
		$this->assertStringContainsString( '&lt;safe&gt;', $code );
		$this->assertStringContainsString( 'data-blx-code-copy', $code );
		$this->assertTrue( PreviewSanitizer::accepts( $code ) );
		$icon = $renderer->render(
			new ElementNode(
				'icon-1',
				'blixis/icon',
				[
					'icon'       => 'solar:check-circle-linear',
					'decorative' => false,
					'ariaLabel'  => 'Complete',
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( 'role="img" aria-label="Complete"', $icon );
		$this->assertStringContainsString( '<circle cx="12" cy="12" r="9"/>', $icon );
		$this->assertTrue( PreviewSanitizer::accepts( $icon ) );
		$icon_svg = $renderer->render(
			new ElementNode(
				'icon-svg-1',
				'blixis/icon-svg',
				[
					'icon'       => 'solar:info-circle-linear',
					'size'       => 128,
					'decorative' => true,
				],
			),
			new RenderContext()
		);
		$this->assertStringContainsString( 'width="128" height="128"', $icon_svg );
		$this->assertStringContainsString( '<path d="M12 11v5m0-8h.01"/>', $icon_svg );
		$this->assertTrue( PreviewSanitizer::accepts( $icon_svg ) );
		$list = $renderer->render(
			new ElementNode(
				'icon-list-1',
				'blixis/icon-list',
				[
					'items'     => [
						[
							'id'   => 'a',
							'text' => '<script>bad</script>',
						],
					],
					'listStyle' => 'check',
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( '<li><span aria-hidden="true" data-blx-list-icon>&#10003;</span>&lt;script&gt;bad&lt;/script&gt;</li>', $list );
		$this->assertTrue( PreviewSanitizer::accepts( $list ) );
		$button = $renderer->render(
			new ElementNode(
				'icon-button-1',
				'blixis/icon-button',
				[
					'action'   => 'toggle',
					'targetId' => 'details',
					'label'    => 'Details',
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( 'aria-expanded="false" aria-controls="details" data-blx-action="toggle"', $button );
		$this->assertTrue( PreviewSanitizer::accepts( $button ) );
		$countdown = $renderer->render(
			new ElementNode( 'countdown-1', 'blixis/countdown', [ 'targetISO' => 'bad <date>' ] ),
			new RenderContext()
		);
		$this->assertStringContainsString( 'role="timer" aria-live="off"', $countdown );
		$this->assertStringContainsString( 'data-blx-countdown-target="2027-01-01T00:00:00Z"', $countdown );
		$this->assertTrue( PreviewSanitizer::accepts( $countdown ) );
		$gradient = $renderer->render(
			new ElementNode(
				'gradient-1',
				'blixis/gradient-text',
				[
					'content'  => 'Gradient',
					'gradient' => [
						'angle' => 90,
						'stops' => [
							[
								'at'    => 0,
								'color' => 'red;}</style>',
							],
							[
								'at'    => 100,
								'color' => '#ec4899',
							],
						],
					],
				]
			),
			new RenderContext()
		);
		$this->assertStringNotContainsString( 'red;}', $gradient );
		$this->assertStringContainsString( 'linear-gradient(90deg,#2563eb 0%,#ec4899 100%)', $gradient );
		$this->assertTrue( PreviewSanitizer::accepts( $gradient ) );
		$tooltip = $renderer->render(
			new ElementNode(
				'tooltip-1',
				'blixis/tooltip-text',
				[
					'content' => 'More',
					'tooltip' => 'Extra & helpful',
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( 'tabindex="0" aria-describedby="tooltip-1-tooltip"', $tooltip );
		$this->assertStringContainsString( 'role="tooltip" id="tooltip-1-tooltip">Extra &amp; helpful</span>', $tooltip );
		$this->assertTrue( PreviewSanitizer::accepts( $tooltip ) );
		$headline = $renderer->render( new ElementNode( 'headline-1', 'blixis/animated-headline', [ 'content' => 'Fast & safe' ] ), new RenderContext() );
		$this->assertStringContainsString( 'aria-label="Fast &amp; safe"', $headline );
		$this->assertStringContainsString( 'data-blx-headline-part', $headline );
		$this->assertTrue( PreviewSanitizer::accepts( $headline ) );
	}

	/** Entitlements remain available by default while the filter is not installed. */
	public function test_entitlement_defaults_to_available_without_a_filter(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$this->assertSame( 'available', $registry->entitlement( 'heading' ) );
	}

	/** Definition renderers produce safe output for layout and content archetypes. */
	public function test_definition_archetypes_render_safe_layout_and_content(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$media    = new class() implements AssetReferenceResolver {
			/** Resolve media references for renderer test.
			 *
			 * @param int $attachment_id Attachment ID.
			 */
			public function resolve( int $attachment_id ): ?array {
				return 42 === $attachment_id ? [
					'url'    => 'https://example.test/avatar.png',
					'width'  => 64,
					'height' => 64,
					'alt'    => 'Profile',
				] : null;
			}
			/** Resolve an imported asset for renderer tests.
			 *
			 * @param string $reference Asset reference.
			 */
			public function resolve_reference( string $reference ): ?array {
				return null;
			}
		};
		$renderer = new DefinitionArchetypeRenderer( $registry, $media );
		$this->assertTrue( $renderer->supports( 'simple' ) );
		$this->assertSame(
			'<img data-blx-id="avatar-1" data-blx-type="blixis/avatar" src="https://example.test/avatar.png" width="64" height="64" alt="A &amp; B" loading="eager" fetchpriority="high" decoding="async">',
			$renderer->render(
				new ElementNode(
					'avatar-1',
					'blixis/avatar',
					[
						'assetRef'      => 'attachment:42',
						'alt'           => 'A & B',
						'loading'       => 'eager',
						'fetchPriority' => 'high',
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<div data-blx-id="avatar-group-1" data-blx-type="blixis/avatar-group" data-blx-columns="2" role="group" aria-label="Team"><ul><li><img src="https://example.test/avatar.png" width="64" height="64" alt="Profile" loading="lazy" decoding="async"></li></ul></div>',
			$renderer->render(
				new ElementNode(
					'avatar-group-1',
					'blixis/avatar-group',
					[
						'assets'    => [ 'attachment:42' ],
						'columns'   => 2,
						'ariaLabel' => 'Team',
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<main data-blx-id="layout-1" data-blx-type="blixis/div" id="content-area" aria-label="Main &amp; content" hidden><p>Child</p></main>',
			$renderer->render(
				new ElementNode(
					'layout-1',
					'blixis/div',
					[
						'semanticTag' => 'main',
						'htmlId'      => 'content-area',
						'ariaLabel'   => 'Main & content',
						'hidden'      => true,
					]
				),
				new RenderContext( '<p>Child</p>' )
			)
		);
		$this->assertSame(
			'<div data-blx-id="scroll-1" data-blx-type="blixis/scroll-area" aria-label="More &amp; content" data-blx-scroll-area tabindex="0" role="region"><p>Scrollable</p></div>',
			$renderer->render(
				new ElementNode( 'scroll-1', 'blixis/scroll-area', [ 'ariaLabel' => 'More & content' ] ),
				new RenderContext( '<p>Scrollable</p>' )
			)
		);
		$this->assertSame(
			'<nav data-blx-id="toc-1" data-blx-type="blixis/table-of-contents" aria-label="On this page"><ul><li><a href="#getting-started">Getting started</a></li></ul></nav>',
			$renderer->render(
				new ElementNode(
					'toc-1',
					'blixis/table-of-contents',
					[
						'ariaLabel' => 'On this page',
						'items'     => [
							[
								'id'    => 'start',
								'label' => 'Getting started',
								'href'  => '#getting-started',
							],
						],
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<blockquote data-blx-id="quote-1" data-blx-type="blixis/blockquote">Evidence &amp; context</blockquote>',
			$renderer->render( new ElementNode( 'quote-1', 'blixis/blockquote', [ 'content' => 'Evidence & context' ] ), new RenderContext() )
		);
		$this->assertSame(
			'<blockquote data-blx-id="quote-2" data-blx-type="blixis/blockquote">Safe fallback</blockquote>',
			$renderer->render(
				new ElementNode(
					'quote-2',
					'blixis/blockquote',
					[
						'content' => 'Safe fallback',
						'tag'     => 'script',
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<p data-blx-id="paragraph-1" data-blx-type="blixis/paragraph">Paragraph</p>',
			$renderer->render( new ElementNode( 'paragraph-1', 'blixis/paragraph', [ 'content' => 'Paragraph' ] ), new RenderContext() )
		);
		$this->assertSame(
			'<kbd data-blx-id="shortcut-1" data-blx-type="blixis/keyboard-shortcut">Ctrl + S &amp; Save</kbd>',
			$renderer->render( new ElementNode( 'shortcut-1', 'blixis/keyboard-shortcut', [ 'content' => 'Ctrl + S & Save' ] ), new RenderContext() )
		);
		$this->assertSame(
			'<div data-blx-id="empty-1" data-blx-type="blixis/empty-state">No results</div>',
			$renderer->render( new ElementNode( 'empty-1', 'blixis/empty-state', [ 'content' => 'No results' ] ), new RenderContext() )
		);
		$this->assertSame(
			'<strong data-blx-id="rich-text-1" data-blx-type="blixis/rich-text">Emphasis</strong>',
			$renderer->render(
				new ElementNode(
					'rich-text-1',
					'blixis/rich-text',
					[
						'content' => 'Emphasis',
						'tag'     => 'strong',
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<span data-blx-id="eyebrow-1" data-blx-type="blixis/eyebrow">Category</span>',
			$renderer->render(
				new ElementNode(
					'eyebrow-1',
					'blixis/eyebrow',
					[
						'content' => 'Category',
						'tag'     => 'span',
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<p data-blx-id="highlight-1" data-blx-type="blixis/highlight-text"><mark>Important &amp; timely</mark></p>',
			$renderer->render( new ElementNode( 'highlight-1', 'blixis/highlight-text', [ 'content' => 'Important & timely' ] ), new RenderContext() )
		);
		$this->assertSame(
			'<span data-blx-id="badge-1" data-blx-type="blixis/badge">New</span>',
			$renderer->render( new ElementNode( 'badge-1', 'blixis/badge', [ 'content' => 'New' ] ), new RenderContext() )
		);
		$this->assertSame(
			'<div data-blx-id="button-group-1" data-blx-type="blixis/button-group" role="group" aria-label="Actions &amp; links"><button>Save</button></div>',
			$renderer->render(
				new ElementNode( 'button-group-1', 'blixis/button-group', [ 'ariaLabel' => 'Actions & links' ] ),
				new RenderContext( '<button>Save</button>' )
			)
		);
		$this->assertSame(
			'<span data-blx-id="counter-1" data-blx-type="blixis/counter" aria-label="Completed">+42.5%</span>',
			$renderer->render(
				new ElementNode(
					'counter-1',
					'blixis/counter',
					[
						'value'     => 42.5,
						'prefix'    => '+',
						'suffix'    => '%',
						'ariaLabel' => 'Completed',
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<span data-blx-id="counter-2" data-blx-type="blixis/counter">42</span>',
			$renderer->render( new ElementNode( 'counter-2', 'blixis/counter', [ 'value' => INF ] ), new RenderContext() )
		);
		$progress_ring = $renderer->render(
			new ElementNode(
				'progress-ring-1',
				'blixis/progress-ring',
				[
					'value'     => 150,
					'max'       => 100,
					'ariaLabel' => 'Upload',
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( 'role="progressbar" aria-label="Upload" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"', $progress_ring );
		$this->assertStringContainsString( 'stroke-dasharray="100 100"', $progress_ring );
		$this->assertStringContainsString( '<span>100%</span>', $progress_ring );
		$this->assertSame(
			'<hr data-blx-id="separator-1" data-blx-type="blixis/separator" aria-hidden="true">',
			$renderer->render( new ElementNode( 'separator-1', 'blixis/separator', [] ), new RenderContext() )
		);
		$this->assertSame(
			'<div data-blx-id="layout-2" data-blx-type="blixis/div" aria-label="&lt;script&gt;"><b>Child</b></div>',
			$renderer->render(
				new ElementNode(
					'layout-2',
					'blixis/div',
					[
						'semanticTag' => 'script',
						'htmlId'      => 'bad id',
						'ariaLabel'   => '<script>',
					]
				),
				new RenderContext( '<b>Child</b>' )
			)
		);
		$this->assertSame(
			'<ol data-blx-id="list-1" data-blx-type="blixis/list" data-blx-list-style="number"><li>One &amp; two</li><li>&lt;script&gt;</li></ol>',
			$renderer->render(
				new ElementNode(
					'list-1',
					'blixis/list',
					[
						'items'     => [ [ 'text' => 'One & two' ], [ 'label' => '<script>' ] ],
						'ordered'   => true,
						'listStyle' => 'number',
					]
				),
				new RenderContext()
			)
		);
		$code_output = $renderer->render(
			new ElementNode(
				'code-1',
				'blixis/code-block',
				[
					'language' => 'php',
					'code'     => '<?php & <?>',
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( 'data-blx-code-block', $code_output );
		$this->assertStringContainsString( '&lt;?php &amp; &lt;?&gt;', $code_output );
		$this->assertStringNotContainsString( '<?php', $code_output );
		$this->assertSame(
			'<a data-blx-id="link-1" data-blx-type="blixis/link" href="#" target="_blank" rel="noopener noreferrer">Open &lt;menu&gt;</a>',
			$renderer->render(
				new ElementNode(
					'link-1',
					'blixis/link',
					[
						'label'  => 'Open <menu>',
						'href'   => 'javascript:alert(1)',
						'target' => '_blank',
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<div data-blx-id="accordion-1" data-blx-type="blixis/accordion"><details open><summary>Question &amp; answer</summary><div>&lt;script&gt;</div></details></div>',
			$renderer->render(
				new ElementNode(
					'accordion-1',
					'blixis/accordion',
					[
						'items'       => [
							[
								'id'      => 'q1',
								'title'   => 'Question & answer',
								'content' => '<script>',
							],
						],
						'defaultOpen' => [ 'q1' ],
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<ol data-blx-id="steps-1" data-blx-type="blixis/steps"><li aria-current="step"><span>First</span><p>Start &amp; finish</p></li><li><span>Second</span></li></ol>',
			$renderer->render(
				new ElementNode(
					'steps-1',
					'blixis/steps',
					[
						'steps'      => [
							[
								'title'       => 'First',
								'description' => 'Start & finish',
							],
							[ 'title' => 'Second' ],
						],
						'activeStep' => 0,
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<ol data-blx-id="timeline-1" data-blx-type="blixis/timeline"><li><span>Plan</span></li><li aria-current="step"><span>Build</span><p>Ship safely</p></li></ol>',
			$renderer->render(
				new ElementNode(
					'timeline-1',
					'blixis/timeline',
					[
						'steps'      => [
							[ 'title' => 'Plan' ],
							[
								'title'       => 'Build',
								'description' => 'Ship safely',
							],
						],
						'activeStep' => 1,
					]
				),
				new RenderContext()
			)
		);
		$tab_id = 'blx-tab-' . substr( hash( 'sha256', 'tabs-1:0' ), 0, 12 );
		$this->assertSame(
			'<div data-blx-id="tabs-1" data-blx-type="blixis/tabs"><nav aria-label="Sections"><ul><li><a href="#' . $tab_id . '">Intro</a></li></ul></nav><section id="' . $tab_id . '"><h2>Intro</h2><p>Body &amp; copy</p></section></div>',
			$renderer->render(
				new ElementNode(
					'tabs-1',
					'blixis/tabs',
					[
						'items' => [
							[
								'id'      => 'intro',
								'label'   => 'Intro',
								'content' => 'Body & copy',
							],
						],
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<div data-blx-id="alert-1" data-blx-type="blixis/alert" role="alert"><strong>Warning</strong><p>Check &amp; retry</p></div>',
			$renderer->render(
				new ElementNode(
					'alert-1',
					'blixis/alert',
					[
						'title'       => 'Warning',
						'description' => 'Check & retry',
						'variant'     => 'error',
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<div data-blx-id="progress-1" data-blx-type="blixis/progress"><progress aria-label="Upload" value="100" max="100"></progress><span>100%</span></div>',
			$renderer->render(
				new ElementNode(
					'progress-1',
					'blixis/progress',
					[
						'value'     => 200,
						'max'       => 100,
						'ariaLabel' => 'Upload',
						'showLabel' => true,
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<span data-blx-id="spinner-1" data-blx-type="blixis/spinner" role="status" aria-label="Loading"><span aria-hidden="true" data-blx-spinner></span></span>',
			$renderer->render( new ElementNode( 'spinner-1', 'blixis/spinner', [ 'ariaLabel' => 'Loading' ] ), new RenderContext() )
		);
		$this->assertSame(
			'<span data-blx-id="dynamic-1" data-blx-type="blixis/post-title">Fallback &amp; title</span>',
			$renderer->render(
				new ElementNode(
					'dynamic-1',
					'blixis/post-title',
					[
						'binding'  => [ 'source' => 'php://filter' ],
						'fallback' => 'Fallback & title',
					]
				),
				new RenderContext()
			)
		);
	}

	/** P3 images and galleries resolve only approved image references and escape captions. */
	public function test_image_aliases_and_galleries_use_approved_media(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$media    = new class() implements AssetReferenceResolver {
			/** Resolve attachment ids for renderer test.
			 *
			 * @param int $attachment_id Attachment ID.
			 */
			public function resolve( int $attachment_id ): ?array {
				return null;
			}

			/** Resolve only the approved fixture key.
			 *
			 * @param string $reference Asset reference.
			 */
			public function resolve_reference( string $reference ): ?array {
				return 'photo' === $reference
					? [
						'url'    => 'https://example.test/photo.jpg',
						'width'  => 640,
						'height' => 480,
						'alt'    => 'House & garden',
					]
					: null;
			}
		};
		$renderer = new DefinitionArchetypeRenderer( $registry, $media );
		$this->assertSame(
			'<figure><img data-blx-id="picture-1" data-blx-type="blixis/picture" src="https://example.test/photo.jpg" width="640" height="480" alt="A house" loading="lazy" decoding="async"><figcaption>Caption &amp; detail</figcaption></figure>',
			$renderer->render(
				new ElementNode(
					'picture-1',
					'blixis/picture',
					[
						'assetRef' => 'photo',
						'alt'      => 'A house',
						'caption'  => 'Caption & detail',
					]
				),
				new RenderContext()
			)
		);
		$hotspots = $renderer->render(
			new ElementNode(
				'hotspots-1',
				'blixis/image-hotspots',
				[
					'assetRef' => 'photo',
					'alt'      => 'Room plan',
					'caption'  => 'Explore the room',
					'hotspots' => [
						[
							'label' => 'Window',
							'x'     => 105,
							'y'     => 25,
							'href'  => 'https://example.test/window',
						],
						[
							'label' => '<script>unsafe</script>',
							'x'     => 5,
							'y'     => 75,
							'href'  => 'javascript:alert(1)',
						],
					],
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( 'data-blx-image-hotspots', $hotspots );
		$this->assertStringContainsString( '--blx-hotspot-x:100%;--blx-hotspot-y:25%', $hotspots );
		$this->assertStringContainsString( '<a href="https://example.test/window">Window</a>', $hotspots );
		$this->assertStringContainsString( '&lt;script&gt;unsafe&lt;/script&gt;', $hotspots );
		$this->assertStringNotContainsString( 'javascript:', $hotspots );
		$this->assertTrue( PreviewSanitizer::accepts( $hotspots ) );
		$panorama = $renderer->render(
			new ElementNode(
				'panorama-1',
				'blixis/panorama-360',
				[
					'assetRef' => 'photo',
					'alt'      => 'Coastline',
					'caption'  => 'West coast',
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( 'data-blx-panorama', $panorama );
		$this->assertStringContainsString( 'role="region" aria-label="360 degree panorama"', $panorama );
		$this->assertStringContainsString( 'alt="Coastline"', $panorama );
		$this->assertStringContainsString( '<figcaption>West coast</figcaption>', $panorama );
		$this->assertTrue( PreviewSanitizer::accepts( $panorama ) );
		$this->assertSame(
			'<div data-blx-id="gallery-1" data-blx-type="blixis/gallery" data-blx-gallery data-blx-columns="2" role="group" aria-label="Gallery"><ul><li><img src="https://example.test/photo.jpg" width="640" height="480" alt="House &amp; garden" loading="lazy" decoding="async"><figcaption>House &amp; garden</figcaption></li></ul></div>',
			$renderer->render(
				new ElementNode(
					'gallery-1',
					'blixis/gallery',
					[
						'assets'    => [ 'photo', 'unapproved' ],
						'columns'   => 2,
						'captions'  => true,
						'ariaLabel' => 'Gallery',
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<div data-blx-id="lightbox-1" data-blx-type="blixis/lightbox" data-blx-gallery data-blx-columns="3" data-blx-lightbox-gallery data-blx-lightbox-label="Image preview" data-blx-lightbox-close="Close image preview" role="group" aria-label="Image gallery"><ul><li><a href="https://example.test/photo.jpg" data-blx-lightbox-trigger aria-label="House &amp; garden"><img src="https://example.test/photo.jpg" width="640" height="480" alt="House &amp; garden" loading="lazy" decoding="async"></a></li></ul></div>',
			$renderer->render(
				new ElementNode(
					'lightbox-1',
					'blixis/lightbox',
					[ 'assets' => [ 'photo' ] ]
				),
				new RenderContext()
			)
		);
		$comparison = $renderer->render(
			new ElementNode(
				'comparison-1',
				'blixis/before-after',
				[
					'beforeAssetRef'     => 'photo',
					'afterAssetRef'      => 'photo',
					'beforeAlt'          => 'Original view',
					'afterAlt'           => 'Renovated view',
					'comparisonPosition' => 65,
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( 'data-blx-image-comparison data-blx-comparison-position="65"', $comparison );
		$this->assertStringContainsString( 'data-blx-comparison-before src="https://example.test/photo.jpg"', $comparison );
		$this->assertStringContainsString( 'data-blx-comparison-after src="https://example.test/photo.jpg"', $comparison );
		$this->assertStringContainsString( 'value="65"', $comparison );
		$this->assertTrue( PreviewSanitizer::accepts( $comparison ) );
	}

	/** P3 video and audio render only attachment-backed, MIME-approved sources. */
	public function test_video_and_audio_render_safe_native_media_elements(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$media    = new class() implements AssetReferenceResolver, PlayableMediaResolver, TextTrackResolver {
			/** Resolve a caption fixture.
			 *
			 * @param int $attachment_id Attachment ID.
			 * @return array{url:string}|null
			 */
			public function resolve_text_track( int $attachment_id ): ?array {
				return 12 === $attachment_id ? [ 'url' => 'https://example.test/captions.vtt' ] : null;
			}
			/** Resolve the poster fixture.
			 *
			 * @param int $attachment_id Attachment ID.
			 */
			public function resolve( int $attachment_id ): ?array {
				return 8 === $attachment_id
					? [
						'url'    => 'https://example.test/poster.jpg',
						'width'  => 640,
						'height' => 360,
						'alt'    => 'Poster',
					]
					: null;
			}
			/** No gallery references are configured.
			 *
			 * @param string $reference Asset reference.
			 */
			public function resolve_reference( string $reference ): ?array {
				unset( $reference );
				return null;
			}
			/** Resolve the video and audio fixtures.
			 *
			 * @param int    $attachment_id Attachment ID.
			 * @param string $kind Media kind.
			 */
			public function resolve_playable( int $attachment_id, string $kind ): ?array {
				if ( 'video' === $kind && 7 === $attachment_id ) {
					return [
						'url'  => 'https://example.test/clip.mp4',
						'mime' => 'video/mp4',
					];
				}
				if ( 'audio' === $kind && 9 === $attachment_id ) {
					return [
						'url'  => 'https://example.test/audio.mp3',
						'mime' => 'audio/mpeg',
					];
				}
				if ( 'video' === $kind && 10 === $attachment_id ) {
					return [
						'url'  => 'https://example.test/unsafe.mov',
						'mime' => 'video/quicktime',
					];
				}
				return null;
			}
		};
		$renderer = new DefinitionArchetypeRenderer( $registry, $media );
		$this->assertSame(
			'<video data-blx-id="video-1" data-blx-type="blixis/video" controls autoplay muted preload="metadata" poster="https://example.test/poster.jpg"><source src="https://example.test/clip.mp4" type="video/mp4"></video>',
			$renderer->render(
				new ElementNode(
					'video-1',
					'blixis/video',
					[
						'src'      => 'media:7',
						'poster'   => 'attachment:8',
						'autoplay' => true,
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<audio data-blx-id="audio-1" data-blx-type="blixis/audio" controls preload="metadata"><source src="https://example.test/audio.mp3" type="audio/mpeg"></audio>',
			$renderer->render( new ElementNode( 'audio-1', 'blixis/audio', [ 'src' => 9 ] ), new RenderContext() )
		);
		$this->assertSame(
			'<video data-blx-id="background-1" data-blx-type="blixis/video-background" autoplay loop muted playsinline preload="metadata" aria-hidden="true" tabindex="-1" poster="https://example.test/poster.jpg"><source src="https://example.test/clip.mp4" type="video/mp4"></video>',
			$renderer->render(
				new ElementNode(
					'background-1',
					'blixis/video-background',
					[
						'src'      => 7,
						'poster'   => 8,
						'autoplay' => true,
						'loop'     => true,
					]
				),
				new RenderContext()
			)
		);
		$captioned = $renderer->render(
			new ElementNode(
				'video-captions',
				'blixis/video',
				[
					'src'          => 7,
					'captionTrack' => 'attachment:12',
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( '<track kind="captions" src="https://example.test/captions.vtt" srclang="en" label="Captions">', $captioned );
		$this->assertSame(
			'<div data-blx-id="video-2" data-blx-type="blixis/video" data-blx-missing-media></div>',
			$renderer->render( new ElementNode( 'video-2', 'blixis/video', [ 'src' => 'https://evil.test/clip.mp4' ] ), new RenderContext() )
		);
		$this->assertSame(
			'<div data-blx-id="video-3" data-blx-type="blixis/video" data-blx-missing-media></div>',
			$renderer->render( new ElementNode( 'video-3', 'blixis/video', [ 'src' => 10 ] ), new RenderContext() )
		);
	}

	/** P3 external media uses safe fallbacks, consent controls and accessible labels. */
	public function test_external_media_and_maps_use_safe_fallbacks_and_controls(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$media    = new class() implements MediaResolver {
			/** No media attachments are configured.
			 *
			 * @param int $attachment_id Attachment ID.
			 */
			public function resolve( int $attachment_id ): ?array {
				unset( $attachment_id );
				return null;
			}
		};
		$renderer = new DefinitionArchetypeRenderer( $registry, $media );
		$embed    = $renderer->render(
			new ElementNode(
				'embed-1',
				'blixis/embed',
				[
					'url'   => 'https://video.example/watch',
					'title' => 'Product demo',
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( 'sandbox="allow-scripts allow-presentation"', $embed );
		$this->assertStringContainsString( 'title="Product demo" loading="lazy" referrerpolicy="no-referrer"', $embed );
		$this->assertStringContainsString( 'href="https://video.example/watch" target="_blank" rel="noopener noreferrer"', $embed );
		$pdf = $renderer->render(
			new ElementNode(
				'pdf-1',
				'blixis/pdf-viewer',
				[
					'url'   => 'https://files.example/guide.pdf?download=0',
					'title' => 'User guide',
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( '<iframe src="https://files.example/guide.pdf?download=0" title="User guide"', $pdf );
		$this->assertStringContainsString( 'height="640"', $pdf );
		$this->assertStringContainsString( '>User guide</a>', $pdf );
		$this->assertSame( '<div data-blx-id="pdf-2" data-blx-type="blixis/pdf-viewer" data-blx-missing-media></div>', $renderer->render( new ElementNode( 'pdf-2', 'blixis/pdf-viewer', [ 'url' => 'https://files.example/guide.html' ] ), new RenderContext() ) );
		$map = $renderer->render(
			new ElementNode(
				'map-1',
				'blixis/map',
				[
					'center'          => [
						'lat' => 52.37,
						'lng' => 4.89,
					],
					'zoom'            => 13,
					'consentRequired' => true,
					'markers'         => [
						[
							'lat'   => 52.38,
							'lng'   => 4.90,
							'label' => '<Station>',
						],
						[
							'lat'   => 120,
							'lng'   => 4,
							'label' => 'Invalid',
						],
					],
				]
			),
			new RenderContext()
		);
		$this->assertStringContainsString( 'data-blx-map-load', $map );
		$this->assertStringContainsString( 'bbox=', $map );
		$this->assertStringNotContainsString( '<iframe', $map );
		$this->assertStringContainsString( '&lt;Station&gt;', $map );
		$this->assertStringNotContainsString( 'Invalid', $map );
		$consented_map = $renderer->render( new ElementNode( 'map-2', 'blixis/map', [ 'consentRequired' => false ] ), new RenderContext() );
		$this->assertStringContainsString( '<iframe class="blx-map-frame"', $consented_map );
	}

	/** P4 breadcrumbs and pagination expose safe, accessible page navigation. */
	public function test_breadcrumbs_and_pagination_render_accessible_links(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$media    = new class() implements MediaResolver {
			/** Resolve media references for renderer test.
			 *
			 * @param int $attachment_id Attachment ID.
			 */
			public function resolve( int $attachment_id ): ?array {
				return null;
			}
		};
		$renderer = new DefinitionArchetypeRenderer( $registry, $media );
		$this->assertSame(
			'<nav data-blx-id="crumb-1" data-blx-type="blixis/breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><span aria-current="page">News &amp; events</span></li></ol></nav>',
			$renderer->render(
				new ElementNode(
					'crumb-1',
					'blixis/breadcrumbs',
					[
						'items' => [
							[
								'label' => 'Home',
								'href'  => '/',
							],
							[ 'label' => 'News & events' ],
						],
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<nav data-blx-id="pages-1" data-blx-type="blixis/pagination" aria-label="Pagination"><ul><li><a rel="prev" href="/articles?page=1">Previous</a></li><li><a href="/articles?page=1">1</a></li><li><span aria-current="page">2</span></li><li><a href="/articles?page=3">3</a></li><li><a rel="next" href="/articles?page=3">Next</a></li></ul></nav>',
			$renderer->render(
				new ElementNode(
					'pages-1',
					'blixis/pagination',
					[
						'basePath'    => '/articles',
						'total'       => 30,
						'pageSize'    => 10,
						'currentPage' => 2,
					]
				),
				new RenderContext()
			)
		);
		$this->assertSame(
			'<nav data-blx-id="pages-2" data-blx-type="blixis/pagination" aria-label="Pagination"><ul><li><a rel="next" href="?page=2">Load more</a></li></ul></nav>',
			$renderer->render(
				new ElementNode(
					'pages-2',
					'blixis/pagination',
					[
						'mode'        => 'load-more',
						'total'       => 20,
						'pageSize'    => 10,
						'currentPage' => 1,
						'basePath'    => 'javascript:alert(1)',
					]
				),
				new RenderContext()
			)
		);
	}
}
