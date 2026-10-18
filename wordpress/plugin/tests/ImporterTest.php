<?php
/** Template import policy tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Templates\Importer;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Registry\ElementDefinitionRegistry;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Isolated policy test.
}
require_once dirname( __DIR__ ) . '/src/Autoloader.php';
\Blixis\Builder\Autoloader::register();

/** Covers import defaults and non-escalation rules without WordPress I/O. */
final class ImporterTest extends TestCase {
	/** Template language tags resolve only to valid enabled WordPress locale keys. */
	public function test_template_locales_map_to_enabled_site_locales_and_skip_disabled_languages(): void {
		$notes = [];
		$map   = Importer::map_template_locales( 'en', [ 'en', 'nl' ], [ 'en_US', 'nl_NL' ], 'en_US', $notes );
		$this->assertSame(
			[
				'en' => 'en_US',
				'nl' => 'nl_NL',
			],
			$map
		);
		foreach ( $map as $locale ) {
			$this->assertTrue( MetaKeys::is_valid_key( MetaKeys::content( $locale ) ) );
		}
		$this->assertFalse( MetaKeys::is_valid_key( '_blixis_content_en' ) );
		$notes = [];
		$map   = Importer::map_template_locales( 'en', [ 'en', 'nl' ], [ 'en_US' ], 'en_US', $notes );
		$this->assertSame( [ 'en' => 'en_US' ], $map );
		$this->assertCount( 1, $notes );
		$this->assertStringContainsString( 'Skipped template locale nl', $notes[0] );
	}

	/** Rich template spans are converted to the inline model and untrusted marks are dropped with notes. */
	public function test_template_rich_text_conversion_drops_unknown_marks_and_token_values(): void {
		$definitions = ElementDefinitionRegistry::from_manifest_file( dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$spec        = $definitions->property( 'heading', 'content' );
		$this->assertIsArray( $spec );
		$notes = [];
		$value = Importer::convert_template_value(
			[
				[
					'text'  => 'Safe text',
					'marks' => [
						[
							'type'  => 'token-color',
							'value' => 'primary',
						],
						[
							'type'  => 'token-color',
							'value' => 'rgb(1,2,3)',
						],
						[
							'type'  => 'raw-html',
							'value' => '<em>unsafe</em>',
						],
					],
				],
			],
			$spec,
			[ 'primary' => '#000000' ],
			$notes
		);
		$this->assertSame(
			[
				'v'      => 1,
				'inline' => [
					[
						't' => 'text',
						's' => 'Safe text',
						'm' => [ [ 'style' => [ 'color' => 'primary' ] ] ],
					],
				],
			],
			$value
		);
		$this->assertCount( 2, $notes );
	}

	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	/** Preserve pack defaults while rejecting escalation and hostile values. */
	public function test_option_defaults_and_hostile_overrides(): void {
		// phpcs:ignore Squiz.PHP.Eval.Discouraged -- Define a minimal WordPress error type in isolation.
		eval( 'namespace { class WP_Error { public function __construct(public $code, public $message, public $data = []) {} } function is_wp_error($value) { return $value instanceof WP_Error; } }' );
		$declared = [
			'createPages'       => true,
			'setHomePage'       => false,
			'createNavigation'  => true,
			'overwriteExisting' => false,
		];
		$this->assertSame( $declared, Importer::normalize_options( $declared, [] ) );
		$disabled = Importer::normalize_options( $declared, [ 'createNavigation' => false ] );
		$this->assertIsArray( $disabled );
		$this->assertSame( false, $disabled['createNavigation'] );
		foreach ( [ [ 'setHomePage' => true ], [ 'publish' => true ], [ 'createPages' => 'yes' ] ] as $hostile ) {
			$this->assertInstanceOf( \WP_Error::class, Importer::normalize_options( $declared, $hostile ) );
		}
	}
}
