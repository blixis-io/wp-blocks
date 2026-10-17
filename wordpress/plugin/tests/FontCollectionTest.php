<?php
/** Font collection schema tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Templates\FontCollection;
use PHPUnit\Framework\TestCase;
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- WordPress bootstrap constant for isolated tests.
}
require_once dirname( __DIR__ ) . '/src/Autoloader.php';
\Blixis\Builder\Autoloader::register();
/** Font collection contract tests. */
final class FontCollectionTest extends TestCase {
	/** Check the documented WordPress font collection shape. */
	public function test_collection_has_wordpress_schema_shape_and_six_local_variable_families(): void {
		$json = file_get_contents( dirname( __DIR__ ) . '/templates/fonts/collection.json' );
		$this->assertNotFalse( $json );
		$data = json_decode( $json, true );
		$this->assertSame( 'Blixis fonts', $data['name'] );
		$this->assertCount( 6, $data['font_families'] );
		foreach ( $data['font_families'] as $family ) {
			$this->assertSame( [ 'sans-serif' ], $family['categories'] );
			$face = $family['font_family_settings']['fontFace'][0];
			$this->assertSame( '200 800', $face['fontWeight'] );
			$this->assertSame( 'normal', $face['fontStyle'] );
			$this->assertSame( 'swap', $face['fontDisplay'] );
			$this->assertIsString( $face['src'] );}
	}
	/** Registration is a no-op when core lacks support. */
	public function test_registration_gracefully_skips_unsupported_wordpress(): void {
		$this->expectNotToPerformAssertions();
		FontCollection::register();
	}
}
