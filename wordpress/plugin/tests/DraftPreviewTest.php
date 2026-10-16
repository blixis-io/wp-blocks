<?php
/**
 * Draft preview authorization contract.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Frontend\DraftPreview;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Every authorization condition is required; failures retain the published path. */
final class DraftPreviewTest extends TestCase {
	/** Anonymous, unauthorized, malformed and wrong-post requests retain the published route. */
	public function test_request_requires_all_authorization_conditions(): void {
		$this->assertTrue( DraftPreview::request_is_authorized( true, true, true, true, 12, true ) );
		$requests = [
			'an archive'                           => [ false, true, true, true, 12, true ],
			'missing query argument'               => [ true, false, true, true, 12, true ],
			'anonymous visitor'                    => [ true, true, false, true, 12, true ],
			'a subscriber without edit capability' => [ true, true, true, false, 12, true ],
			'a missing post'                       => [ true, true, true, true, 0, true ],
			'an invalid or expired nonce'          => [ true, true, true, true, 12, false ],
			'a nonce issued for another post'      => [ true, true, true, true, 12, false ],
		];
		foreach ( $requests as $request ) {
			$this->assertFalse( DraftPreview::request_is_authorized( ...$request ) );
		}
	}
}
