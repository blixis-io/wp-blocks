<?php
/** Generated definition registry tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Registry\ElementDefinitionRegistry;
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

	/** P1 layout wrappers retain accessible metadata and never emit arbitrary tags or IDs. */
	public function test_layout_archetypes_render_safe_semantics_and_simple_elements(): void {
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
	}
}
