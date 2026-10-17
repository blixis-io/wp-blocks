<?php
/**
 * Setup template adapter tests.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme\Tests;

use Blixis\Theme\SetupTemplates;
use Blixis\Theme\TokenDraft;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound
}
require_once \dirname( __DIR__ ) . '/src/TokenDraft.php';
require_once \dirname( __DIR__ ) . '/src/FontLibrary.php';
require_once \dirname( __DIR__ ) . '/src/SetupTemplates.php';

/** Server-side pack mapping is bounded by the existing token contract. */
final class SetupTemplatesTest extends TestCase {
	/** Maps the supported palette subset and ignores unsupported tokens. */
	public function test_maps_only_validated_pack_palette_values(): void {
		$seed = TokenDraft::seed( \dirname( __DIR__ ) . '/design/default-tokens.json', 'custom' );
		$this->assertNotNull( $seed );
		$pack   = json_decode( (string) file_get_contents( \dirname( __DIR__, 2 ) . '/plugin/templates/packs/modern-homes/template.json' ), true );
		$mapped = SetupTemplates::tokens( $pack['designTokens'], $seed );
		$this->assertSame( [], TokenDraft::validate( $mapped, $seed ) );
		$this->assertSame( '#FFFFFF', $mapped['color-bg']['value'] );
		$this->assertSame( '#0B1220', $mapped['color-bg']['dark'] );
		$this->assertSame( $seed['space-4'], $mapped['space-4'] );
	}

	/** Invalid palette content cannot escape the seed contract. */
	public function test_invalid_or_low_contrast_palette_falls_back_to_seed(): void {
		$seed = TokenDraft::seed( \dirname( __DIR__ ) . '/design/default-tokens.json', 'custom' );
		$this->assertNotNull( $seed );
		$this->assertSame(
			$seed,
			SetupTemplates::tokens(
				[
					'colors' => [
						'light' => [],
						'dark'  => [],
					],
				],
				$seed
			)
		);
	}
}
