<?php
/** WooCommerce renderer safety tests.
 *
 * @package Blixis\Pro\Tests
 */

declare(strict_types=1);

namespace Blixis\Pro\Tests;

use Blixis\Builder\Render\ElementNode;
use Blixis\Builder\Render\RenderContext;
use Blixis\Pro\WooCommerceRenderer;
use PHPUnit\Framework\TestCase;

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__, 2 ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once dirname( __DIR__, 2 ) . '/plugin/src/Autoloader.php';
\Blixis\Builder\Autoloader::register();
require_once dirname( __DIR__ ) . '/src/WooCommerceRenderer.php';
require_once __DIR__ . '/WooCommerceProductStub.php';

/** Renderer tests that do not require WooCommerce or checkout APIs. */
final class WooCommerceRendererTest extends TestCase {
	/** Preview output remains inert and escapes user supplied labels. */
	public function test_preview_is_inert_and_escaped(): void {
		$renderer = new WooCommerceRenderer( 'cart' );
		$html     = $renderer->render(
			new ElementNode( 'cart-01', 'blixis/cart-icon', [ 'label' => '<img src=x onerror=alert(1)>' ] ),
			new RenderContext( preview: true )
		);
		self::assertStringContainsString( '&lt;img', $html );
		self::assertStringNotContainsString( '<img', $html );
		self::assertStringNotContainsString( '<form', $html );
	}

	/** Unknown renderer kinds fail to the static label. */
	public function test_unknown_kind_does_not_call_commerce_apis(): void {
		$renderer = new WooCommerceRenderer( 'unknown' );
		$html     = $renderer->render(
			new ElementNode( 'cart-01', 'blixis/cart-icon', [ 'label' => 'Basket' ] ),
			new RenderContext( preview: true )
		);
		self::assertStringContainsString( 'Basket', $html );
	}

	/** The product query is bounded and visitor supplied output is escaped/sanitized. */
	public function test_product_grid_bounds_query_and_sanitizes_public_product_data(): void {
		$query    = [];
		$products = [
			new WooCommerceProductStub( '<script>alert(1)</script>Safe name', 'javascript:alert(1)', true, '<del>$10</del><script>alert(2)</script>' ),
			new WooCommerceProductStub( 'Unavailable product', 'https://example.test/product/', false, '<span>$20</span>' ),
		];
		$renderer = new WooCommerceRenderer(
			'product-grid',
			static function ( array $arguments ) use ( &$query, $products ): array {
				$query = $arguments;
				return $products;
			},
			static fn( string $html ): string => strip_tags( $html, '<del><span>' )
		);
		$html     = $renderer->render( new ElementNode( 'grid-01', 'blixis/product-grid', [ 'maxItems' => 30 ] ), new RenderContext() );
		self::assertSame( 12, $query['limit'] );
		self::assertStringContainsString( '&lt;script&gt;alert(1)&lt;/script&gt;Safe name', $html );
		self::assertStringNotContainsString( 'href="javascript:', $html );
		self::assertStringNotContainsString( '<script>', $html );
		self::assertStringContainsString( '<del>$10</del>', $html );
		self::assertStringContainsString( 'is-unavailable', $html );
		self::assertStringContainsString( 'Currently unavailable', $html );
	}
}
