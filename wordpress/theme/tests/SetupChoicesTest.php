<?php
/**
 * Setup palette schema and contrast tests.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme\Tests;

use Blixis\Theme\SetupChoices;
use Blixis\Theme\TokenDraft;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test stand-in.
}
require_once \dirname( __DIR__ ) . '/src/TokenDraft.php';
require_once \dirname( __DIR__ ) . '/src/SetupChoices.php';

/** Curated wizard palette validation. */
final class SetupChoicesTest extends TestCase {
	/** Each scheme derives from a validated preset and passes the full token contrast contract. */
	public function test_schemes_are_valid_and_contrast_safe(): void {
		$schemes = SetupChoices::schemes( \dirname( __DIR__ ) );
		$this->assertCount( 4, $schemes );
		$this->assertSame( [ 'primary', 'nature', 'secondary', 'neutral' ], array_column( $schemes, 'id' ) );
		foreach ( $schemes as $scheme ) {
			$this->assertSame( [], TokenDraft::validate( $scheme['tokens'], $scheme['tokens'] ), $scheme['id'] );
			foreach ( [ 'color-bg', 'color-surface', 'color-text', 'color-muted', 'color-link', 'color-primary', 'color-on-primary', 'color-line' ] as $token ) {
				$this->assertArrayHasKey( $token, $scheme['tokens'] );
			}
		}
	}

	/** Every preset carries bounded, plain English display copy checked by the seed validator. */
	public function test_preset_copy_is_required_and_validated(): void {
		foreach ( [ 'ocean', 'forest', 'sunset', 'minimal' ] as $id ) {
			$path = \dirname( __DIR__ ) . '/design/presets/' . $id . '.json';
			$data = json_decode( (string) file_get_contents( $path ), true );
			$this->assertIsString( $data['label'] ?? null );
			$this->assertIsString( $data['tagline'] ?? null );
			$this->assertNotNull( TokenDraft::seed( $path, $id ) );
			$data['tagline'] = '<script>alert(1)</script>';
			$bad             = tempnam( sys_get_temp_dir(), 'blx-preset-' );
			$this->assertNotFalse( $bad );
			try {
				file_put_contents( $bad, json_encode( $data ) );
				$this->assertNull( TokenDraft::seed( $bad, $id ) );
			} finally {
				unlink( $bad );
			}
		}
	}

	/** Font pairings use only validated bundled or server-derived font stacks. */
	public function test_font_pairing_schema_and_allowlist(): void {
		$theme_directory = \dirname( __DIR__ );
		$fonts           = SetupChoices::fonts( [], $theme_directory );
		$this->assertCount( 3, $fonts );
		$this->assertSame( [ 'system', 'editorial', 'technical' ], array_column( $fonts, 'id' ) );
		$this->assertCount( 3, SetupChoices::fonts( [ 'Evil; background:url(x)' ], $theme_directory ) );
		foreach ( $fonts as $font ) {
			$this->assertNotSame( '', $font['label'] );
			$this->assertNotSame( '', $font['descriptor'] );
		}
	}

	/** The step-one handler helper copies selected colors and font tokens and rejects unknown choice ids. */
	public function test_applying_choices_updates_only_validated_token_values(): void {
		$theme_directory = \dirname( __DIR__ );
		$seed            = TokenDraft::seed( $theme_directory . '/design/presets/ocean.json', 'ocean' );
		$this->assertNotNull( $seed );
		$selected = SetupChoices::apply_to_tokens( $seed, 'nature', 'editorial', [], $theme_directory );
		$this->assertNotNull( $selected );
		$forest = TokenDraft::seed( $theme_directory . '/design/presets/forest.json', 'forest' );
		$this->assertNotNull( $forest );
		$this->assertSame( $forest['color-bg'], $selected['color-bg'] );
		$this->assertSame( 'Georgia, "Times New Roman", serif', $selected['font-heading']['value'] );
		$this->assertSame( $seed['space-4'], $selected['space-4'] );
		$this->assertNull( SetupChoices::apply_to_tokens( $seed, 'unlisted', 'editorial', [], $theme_directory ) );
		$this->assertNull( SetupChoices::apply_to_tokens( $seed, 'nature', 'unlisted', [], $theme_directory ) );
	}
}
