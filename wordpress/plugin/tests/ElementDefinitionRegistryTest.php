<?php
/** Generated definition registry tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Registry\ElementDefinitionRegistry;
use Blixis\Builder\Render\AssetReferenceResolver;
use Blixis\Builder\Render\DefinitionArchetypeRenderer;
use Blixis\Builder\Render\ElementNode;
use Blixis\Builder\Render\MediaResolver;
use Blixis\Builder\Render\RenderContext;
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
	}

	/** Entitlements remain available by default while the filter is not installed. */
	public function test_entitlement_defaults_to_available_without_a_filter(): void {
		$registry = ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$this->assertSame( 'available', $registry->entitlement( 'heading' ) );
	}

	/** Definition renderers produce safe output for layout and content archetypes. */
	public function test_definition_archetypes_render_safe_layout_and_content(): void {
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
		$this->assertTrue( $renderer->supports( 'simple' ) );
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
		$this->assertSame(
			'<pre data-blx-id="code-1" data-blx-type="blixis/code-block"><code class="language-php">&lt;?php &amp; &lt;?&gt;</code></pre>',
			$renderer->render(
				new ElementNode(
					'code-1',
					'blixis/code-block',
					[
						'language' => 'php',
						'code'     => '<?php & <?>',
					]
				),
				new RenderContext()
			)
		);
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
		$this->assertSame(
			'<div data-blx-id="gallery-1" data-blx-type="blixis/gallery" data-blx-columns="2" role="group" aria-label="Gallery"><ul><li><img src="https://example.test/photo.jpg" width="640" height="480" alt="House &amp; garden" loading="lazy" decoding="async"><figcaption>House &amp; garden</figcaption></li></ul></div>',
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
	}
}
