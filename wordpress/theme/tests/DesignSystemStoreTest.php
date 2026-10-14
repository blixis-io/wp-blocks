<?php
/**
 * Tests for the pure parts of the design system store (BWB-035).
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme\Tests;

use Blixis\Theme\DesignSystemStore;
use Blixis\Theme\TokenDraft;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Stands in for WordPress so the guarded theme files load.
}
require_once dirname( __DIR__ ) . '/src/TokenDraft.php';
require_once dirname( __DIR__ ) . '/src/DesignSystemStore.php';

/**
 * State building, history, rollback planning and the printed CSS.
 */
final class DesignSystemStoreTest extends TestCase {

	/**
	 * The default token set.
	 *
	 * @return array<string, mixed>
	 */
	private static function seed(): array {
		$seed = TokenDraft::seed( dirname( __DIR__ ) . '/design/default-tokens.json', 'custom' );
		self::assertIsArray( $seed );
		return $seed;
	}

	/**
	 * A valid stored state.
	 *
	 * @param int $version Token version.
	 * @return array<string, mixed>
	 */
	private static function state( int $version ): array {
		return DesignSystemStore::next_state( 1 === $version ? null : [ 'tokenVersion' => $version - 1 ], self::seed(), 'custom', '2026-01-01T00:00:00+00:00' );
	}

	/**
	 * The printed CSS is exactly what the compiler wrote into tokens.css for the same tokens, so a saved default design
	 * looks identical to the bundled one.
	 */
	public function test_css_matches_the_compiled_token_file(): void {
		$compiled = (string) file_get_contents( dirname( __DIR__ ) . '/assets/css/tokens.css' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Test reads a local file.
		$lines    = explode( "\n", trim( $compiled ) );
		$layer    = array_values( array_filter( $lines, static fn( string $line ): bool => str_starts_with( $line, '@layer blx.tokens{' ) ) );
		$this->assertCount( 1, $layer );
		// The compiler lower-cases identifiers (font names are case-insensitive in CSS); everything else is identical.
		$this->assertSame( strtolower( $layer[0] ), strtolower( DesignSystemStore::css( self::seed() ) ) );
	}

	/**
	 * Values that could leave a declaration or a style element are never printed.
	 */
	public function test_css_skips_unsafe_values_and_names(): void {
		$css = DesignSystemStore::css(
			[
				'color-bg'   => [ 'value' => '#fff' ],
				'color-evil' => [ 'value' => 'red;} body{display:none' ],
				'color-tag'  => [ 'value' => '</style><script>' ],
				'color-url'  => [ 'value' => 'url(https://x.example/a)' ],
				'Bad Name'   => [ 'value' => '#000' ],
				'color-low'  => [
					'value' => '#111',
					'dark'  => '#222;x',
				],
				'color-same' => [
					'value' => '#333',
					'dark'  => '#333',
				],
			]
		);
		$this->assertStringContainsString( '--blx-color-bg:#fff', $css );
		$this->assertStringContainsString( '--blx-color-low:#111', $css );
		$this->assertStringNotContainsString( 'evil', $css );
		$this->assertStringNotContainsString( '</style>', $css );
		$this->assertStringNotContainsString( 'x.example', $css );
		$this->assertStringNotContainsString( 'Bad', $css );
		$this->assertStringNotContainsString( '#222', $css );
		$this->assertStringNotContainsString( 'data-theme="dark"', $css, 'no dark rule when no valid dark value differs' );
		$this->assertSame( '', DesignSystemStore::css( [] ) );
	}

	/**
	 * Dark values are emitted for the explicit theme and for auto, base first.
	 */
	public function test_css_has_the_dark_forms(): void {
		$css = DesignSystemStore::css(
			[
				'color-bg' => [
					'value' => '#ffffff',
					'dark'  => '#000000',
				],
			]
		);
		$this->assertSame(
			'@layer blx.tokens{:where(:root){--blx-color-bg:#ffffff}:where(html[data-theme="dark"]){--blx-color-bg:#000000}@media (prefers-color-scheme:dark){:where(html:not([data-theme="light"]):not([data-theme="dark"])){--blx-color-bg:#000000}}}',
			$css
		);
	}

	/**
	 * Versions only move forward; the first save is version 1.
	 */
	public function test_next_state_raises_the_version(): void {
		$this->assertSame( 1, self::state( 1 )['tokenVersion'] );
		$this->assertSame( 8, DesignSystemStore::next_state( [ 'tokenVersion' => 7 ], [], 'ocean', 'now' )['tokenVersion'] );
	}

	/**
	 * Stored data is validated, not repaired.
	 */
	public function test_normalize_accepts_valid_and_rejects_the_rest(): void {
		$seed  = self::seed();
		$state = self::state( 3 );
		$this->assertSame( $state, DesignSystemStore::normalize( $state, $seed ) );
		foreach ( [ false, null, 'x', [], array_merge( $state, [ 'version' => 2 ] ), array_merge( $state, [ 'tokenVersion' => 0 ] ), array_merge( $state, [ 'tokenVersion' => '3' ] ), array_merge( $state, [ 'preset' => 'Bad Preset' ] ), array_merge( $state, [ 'tokens' => [ 'unknown' => [ 'value' => 'x' ] ] ] ), array_merge( $state, [ 'tokens' => 'x' ] ) ] as $bad ) {
			$this->assertNull( DesignSystemStore::normalize( $bad, $seed ) );
		}
	}

	/**
	 * The history keeps the newest entries only.
	 */
	public function test_history_is_bounded_and_newest_first(): void {
		$history = [];
		for ( $i = 1; $i <= 8; ++$i ) {
			$history = DesignSystemStore::push_history( $history, [ 'tokenVersion' => $i ] );
		}
		$this->assertCount( DesignSystemStore::MAX_HISTORY, $history );
		$this->assertSame( 8, $history[0]['tokenVersion'] );
		$this->assertSame( 4, $history[4]['tokenVersion'] );
		$this->assertSame( [], DesignSystemStore::push_history( [], null ) );
	}

	/**
	 * Rollback restores the newest earlier content under a higher version and drops the replaced state.
	 */
	public function test_rollback_plan(): void {
		$this->assertNull( DesignSystemStore::rollback_plan( null, [], 'now' ) );
		$this->assertNull( DesignSystemStore::rollback_plan( [ 'tokenVersion' => 2 ], [], 'now' ) );
		$plan = DesignSystemStore::rollback_plan(
			[ 'tokenVersion' => 5 ],
			[
				[
					'tokenVersion' => 4,
					'preset'       => 'ocean',
					'tokens'       => [ 'a' => 1 ],
				],
				[ 'tokenVersion' => 3 ],
			],
			'later'
		);
		$this->assertNotNull( $plan );
		$this->assertSame( 6, $plan['state']['tokenVersion'] );
		$this->assertSame( 'ocean', $plan['state']['preset'] );
		$this->assertSame( 'later', $plan['state']['updated_at'] );
		$this->assertSame( [ [ 'tokenVersion' => 3 ] ], $plan['history'] );
	}
}
