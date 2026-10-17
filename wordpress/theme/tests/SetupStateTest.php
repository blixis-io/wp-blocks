<?php
/**
 * Pure setup status tests (BWB-033).
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme\Tests;

use Blixis\Theme\SetupState;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Stands in for WordPress.
}
require_once dirname( __DIR__ ) . '/src/SetupState.php';
require_once dirname( __DIR__ ) . '/src/TokenDraft.php';

/**
 * Validation and entry action transitions without WordPress.
 */
final class SetupStateTest extends TestCase {

	private const NOW = '2026-10-14T10:00:00+00:00';

	/**
	 * Reject corrupt and future data without throwing.
	 *
	 * @return array<string, array{mixed}>
	 */
	public static function invalid_values(): array {
		$valid = SetupState::initial( self::NOW );
		return [
			'missing'        => [ false ],
			'not an array'   => [ 'garbage' ],
			'future version' => [ array_merge( $valid, [ 'version' => 2 ] ) ],
			'string version' => [ array_merge( $valid, [ 'version' => '1' ] ) ],
			'unknown status' => [ array_merge( $valid, [ 'status' => 'broken' ] ) ],
			'bad date'       => [ array_merge( $valid, [ 'updated_at' => 'yesterday' ] ) ],
			'invalid preset' => [ array_merge( $valid, [ 'preset' => '<script>' ] ) ],
			'unknown field'  => [ array_merge( $valid, [ 'extra' => true ] ) ],
			'missing date'   => [
				[
					'version' => 1,
					'status'  => 'not_started',
				],
			],
		];
	}

	/**
	 * Invalid data is never accepted as a status.
	 *
	 * @param mixed $value Corrupt value.
	 */
	#[DataProvider( 'invalid_values' )]
	public function test_rejects_invalid_values( mixed $value ): void {
		$this->assertNull( SetupState::normalize( $value ) );
		$this->assertNull( SetupState::transition( $value, 'dismiss', self::NOW ) );
	}

	/**
	 * Valid status and preset survive normalization.
	 */
	public function test_normalizes_valid_state(): void {
		$state = array_merge( SetupState::initial( self::NOW ), [ 'preset' => 'forest' ] );
		$this->assertSame( $state, SetupState::normalize( $state ) );
	}

	/** The production start transition and the WP-CLI millisecond timestamp shape round-trip through the page reader. */
	public function test_start_and_cli_option_shapes_round_trip(): void {
		$started = SetupState::transition( SetupState::initial( self::NOW ), 'start', self::NOW );
		$this->assertNotNull( $started );
		$this->assertSame( 'in_progress', $started['status'] );
		$this->assertSame( $started, SetupState::read( $started ) );
		$cli_state = array_merge( $started, [ 'updated_at' => '2026-10-14T10:00:00.000Z' ] );
		$this->assertSame( $cli_state, SetupState::read( json_encode( $cli_state ) ) );
	}

	/** Malformed legacy data is shown as not started and can be recovered by starting again. */
	public function test_invalid_state_can_restart(): void {
		$started = SetupState::transition( '{"status":"broken"}', 'start', self::NOW );
		$this->assertNotNull( $started );
		$this->assertSame( 'in_progress', $started['status'] );
		$this->assertNull( SetupState::normalize( '{"status":"broken"}' ) );
		$this->assertSame( 'not_started', SetupState::read( '{"status":"broken"}' )['status'] );
	}

	/**
	 * Start is idempotent, a dismissed setup can resume, and completed setup stays closed.
	 */
	public function test_entry_transitions(): void {
		$initial = SetupState::initial( self::NOW );
		$started = SetupState::transition( $initial, 'start', '2026-10-14T11:00:00+00:00' );
		$this->assertNotNull( $started );
		$this->assertSame( 'in_progress', $started['status'] );
		$this->assertSame( $started, SetupState::transition( $started, 'start', self::NOW ) );
		$dismissed = SetupState::transition( $started, 'dismiss', self::NOW );
		$this->assertNotNull( $dismissed );
		$this->assertSame( 'dismissed', $dismissed['status'] );
		$this->assertNull( SetupState::transition( $initial, 'invalid', self::NOW ) );
		$this->assertNull( SetupState::transition( array_merge( $initial, [ 'status' => 'completed' ] ), 'start', self::NOW ) );
		$reopened = SetupState::transition( array_merge( $initial, [ 'status' => 'dismissed' ] ), 'start', self::NOW );
		$this->assertNotNull( $reopened );
		$this->assertSame( 'in_progress', $reopened['status'] );
	}

	/** Wizard navigation is bounded and has no Apply transition yet. */
	public function test_wizard_step_transitions(): void {
		$this->assertSame( 2, SetupState::next_step( 1, 'next' ) );
		$this->assertSame( 5, SetupState::next_step( 6, 'back' ) );
		$this->assertNull( SetupState::next_step( 1, 'back' ) );
		$this->assertNull( SetupState::next_step( 6, 'next' ) );
		$this->assertNull( SetupState::next_step( 3, 'apply' ) );
		$this->assertNull( SetupState::next_step( 7, 'next' ) );
	}

	/**
	 * Resume position accepts only a single valid step and cannot influence site status.
	 */
	public function test_user_interface_state_is_separate(): void {
		$this->assertSame( [ 'resume_step' => 3 ], SetupState::normalize_ui( [ 'resume_step' => 3 ] ) );
		$this->assertNull( SetupState::normalize_ui( [ 'resume_step' => '3' ] ) );
		$this->assertNull( SetupState::normalize_ui( [ 'resume_step' => 7 ] ) );
		$this->assertNull(
			SetupState::normalize_ui(
				[
					'resume_step' => 2,
					'status'      => 'completed',
				]
			)
		);
	}

	/** Going forward then back retains the complete selected preset draft for resume. */
	public function test_draft_round_trip_through_next_back_and_resume(): void {
		$seed = \Blixis\Theme\TokenDraft::seed( dirname( __DIR__ ) . '/design/presets/ocean.json', 'ocean' );
		$this->assertNotNull( $seed );
		$draft  = [
			'preset'     => 'ocean',
			'tokens'     => $seed,
			'appearance' => 'dark',
		];
		$stored = json_encode( $draft );
		$this->assertIsString( $stored );

		$next = SetupState::next_step( 1, 'next' );
		$this->assertSame( 2, $next );
		$resume = SetupState::normalize_ui( [ 'resume_step' => $next ] );
		$this->assertSame( [ 'resume_step' => 2 ], $resume );
		$back = SetupState::next_step( $resume['resume_step'], 'back' );
		$this->assertSame( 1, $back );
		$resumed_draft = json_decode( $stored, true );
		$this->assertSame( 'ocean', $resumed_draft['preset'] );
		$this->assertSame( 'dark', $resumed_draft['appearance'] );
		$this->assertSame( $seed, $resumed_draft['tokens'] );
	}
}
