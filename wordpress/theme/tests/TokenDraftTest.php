<?php
/**
 * Setup draft validation and shared contrast parity.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme\Tests;

use Blixis\Theme\TokenDraft;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test stand-in.
}
require_once \dirname( __DIR__ ) . '/src/TokenDraft.php';

/** Pure draft checks. */
final class TokenDraftTest extends TestCase {
	/** Every bundled choice must pass draft validation. */
	public function test_bundled_seeds(): void {
		foreach ( array( 'custom', 'ocean', 'forest', 'sunset', 'minimal' ) as $preset ) {
			$path = \dirname( __DIR__ ) . '/design/' . ( 'custom' === $preset ? 'default-tokens.json' : 'presets/' . $preset . '.json' );
			$this->assertNotNull( TokenDraft::seed( $path, $preset ), $preset );
		}
	}

	/** Hostile colors, names, oversized data and contrast failures are rejected. */
	public function test_rejections(): void {
		$seed = TokenDraft::seed( \dirname( __DIR__ ) . '/design/presets/ocean.json', 'ocean' );
		$this->assertNotNull( $seed );
		$bad                        = $seed;
		$bad['color-text']['value'] = 'red;background:url(x)';
		$this->assertArrayHasKey( 'color-text-value', TokenDraft::validate( $bad, $seed ) );
		$bad['color-text']['value'] = array( '#000' );
		$this->assertArrayHasKey( 'color-text-value', TokenDraft::validate( $bad, $seed ) );
		$bad               = $seed;
		$bad['unexpected'] = array( 'value' => '#000' );
		$this->assertArrayHasKey( 'tokens', TokenDraft::validate( $bad, $seed ) );
		$bad                       = $seed;
		$bad['font-body']['value'] = \str_repeat( 'x', 9000 );
		$this->assertArrayHasKey( 'tokens', TokenDraft::validate( $bad, $seed ) );
		$bad                       = $seed;
		$bad['color-text']['dark'] = $bad['color-bg']['dark'];
		$this->assertArrayHasKey( 'color-text-dark', TokenDraft::validate( $bad, $seed ) );
	}

	/** PHP and TypeScript use the same WCAG sRGB examples. */
	public function test_contrast_parity(): void {
		$source = \file_get_contents( \dirname( __DIR__, 3 ) . '/tests/fixtures/contrast-ratios.json' );
		$this->assertIsString( $source );
		$fixture = \json_decode( $source, true );
		foreach ( $fixture['cases'] as $entry ) {
			$this->assertEqualsWithDelta( (float) $entry['ratio'], TokenDraft::contrast_ratio( $entry['foreground'], $entry['background'] ), 0.0000000001 );
		}
	}
}
