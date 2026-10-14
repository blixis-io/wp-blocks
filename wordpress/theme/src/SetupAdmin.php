<?php
/**
 * Appearance setup wizard.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

/**
 * Permission-checked, server-rendered setup workflow.
 */
final class SetupAdmin {
	private const CAPABILITY   = 'edit_theme_options';
	private const NONCE_ACTION = 'blixis_setup_action';
	private const DRAFT_META   = 'blixis_setup_draft';
	private const STEP_NAMES   = [
		1 => 'Choose preset',
		2 => 'Colors',
		3 => 'Typography',
		4 => 'Spacing, radius and layout',
		5 => 'Preview',
		6 => 'Apply',
	];
	private const PRESETS      = [
		'ocean'   => 'Ocean',
		'forest'  => 'Forest',
		'sunset'  => 'Sunset',
		'minimal' => 'Minimal',
		'custom'  => 'Custom',
	];

	/** Register admin hooks. */
	public static function register(): void {
		add_action( 'admin_menu', [ self::class, 'menu' ] );
		add_action( 'admin_notices', [ self::class, 'notice' ] );
		foreach ( [ 'start', 'dismiss', 'wizard', 'rollback' ] as $action ) {
			add_action( 'admin_post_blixis_setup_' . $action, [ self::class, $action ] );
		}
	}

	/** Add Appearance submenu. */
	public static function menu(): void {
		add_theme_page( __( 'Blixis setup', 'blixis' ), __( 'Blixis setup', 'blixis' ), self::CAPABILITY, 'blixis-setup', [ self::class, 'page' ] );
	}

	/** Show the entry notice. */
	public static function notice(): void {
		if ( ! current_user_can( self::CAPABILITY ) || is_network_admin() ) {
			return;
		}
		$state = SetupState::get();
		if ( null === $state || ! \in_array( $state['status'], [ 'not_started', 'in_progress' ], true ) ) {
			return;
		}
		?>
		<div class="notice notice-info"><p><?php echo esc_html__( 'Set up the Blixis theme when you are ready.', 'blixis' ); ?></p>
		<?php self::action_form( 'start', __( 'Start setup', 'blixis' ) ); ?>
		<?php self::action_form( 'dismiss', __( 'Dismiss', 'blixis' ) ); ?></div>
		<?php
	}

	/** Render the current step; an explicit step query supports revisiting prior steps. */
	public static function page(): void {
		self::require_capability();
		$state      = SetupState::get();
		$user_id    = get_current_user_id();
		$resume     = SetupState::resume_step( $user_id );
		$requested  = isset( $_GET['step'] ) ? (int) $_GET['step'] : $resume; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only navigation.
		$step       = max( 1, min( $resume, $requested ) );
		$stored     = self::draft( $user_id );
		$preset     = $stored['preset'] ?? 'custom';
		$tokens     = $stored['tokens'] ?? self::preset_tokens( 'custom' );
		$appearance = $stored['appearance'] ?? Appearance::site_mode();
		if ( null === $tokens ) {
			$tokens = [];
		}
		$errors = get_user_meta( $user_id, 'blixis_setup_errors', true );
		$errors = \is_array( $errors ) ? $errors : [];
		delete_user_meta( $user_id, 'blixis_setup_errors' );
		if ( isset( $_GET['error'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Fixed post-redirect error code.
			$code = sanitize_key( wp_unslash( $_GET['error'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only message.
			if ( 'contrast' === $code && ! $errors ) {
				$errors['tokens'] = __( 'Color contrast is too low.', 'blixis' );
			} elseif ( 'invalid' === $code ) {
				$errors = $errors ? $errors : [ 'tokens' => __( 'The submitted values were invalid. Check every field and try again.', 'blixis' ) ];
			} elseif ( 'not-saved' === $code ) {
				$errors['tokens'] = __( 'The design system could not be saved. Nothing was changed; try again.', 'blixis' );
			} elseif ( 'unavailable' === $code ) {
				$errors['tokens'] = __( 'The bundled design data is unavailable.', 'blixis' );
			}
		}
		?>
		<div class="wrap blixis-setup"><h1><?php echo esc_html__( 'Blixis setup', 'blixis' ); ?></h1>
		<?php self::saved_panel(); ?>
		<?php if ( null === $state ) : ?>
			<p><?php echo esc_html__( 'Setup status is unavailable.', 'blixis' ); ?></p>
		<?php else : ?>
			<p><?php echo esc_html__( 'Current status:', 'blixis' ); ?> <strong><?php echo esc_html( $state['status'] ); ?></strong></p>
			<nav aria-label="<?php echo esc_attr__( 'Setup steps', 'blixis' ); ?>"><ol>
			<?php foreach ( self::STEP_NAMES as $number => $title ) : ?>
				<li <?php echo $number === $step ? 'aria-current="step"' : ''; ?>><?php echo esc_html( $number . '. ' . $title ); ?></li>
			<?php endforeach; ?>
			</ol></nav>
			<h2><?php echo esc_html( self::STEP_NAMES[ $step ] ); ?></h2>
			<?php
			if ( $errors ) :
				?>
				<div role="alert" class="notice notice-error"><p><?php echo esc_html__( 'Please correct these fields:', 'blixis' ); ?></p><ul>
				<?php
				foreach ( $errors as $field => $message ) :
					?>
					<li><a href="#<?php echo esc_attr( $field ); ?>"><?php echo esc_html( $message ); ?></a></li><?php endforeach; ?>
			</ul></div><?php endif; ?>
			<?php
			if ( 6 === $step ) :
				?>
				<p><?php echo esc_html__( 'Applying saves this design system for the whole site. Every page changes at once; you can restore the previous version afterwards.', 'blixis' ); ?></p><?php endif; ?>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="blixis_setup_wizard"><input type="hidden" name="step" value="<?php echo esc_attr( (string) $step ); ?>">
				<?php wp_nonce_field( 'blixis_setup_step_' . $step, 'blixis_setup_nonce_wizard' ); ?>
				<?php self::fields( $step, $preset, $tokens, $appearance ); ?>
				<p class="submit">
				<?php
				if ( $step > 1 ) :
					?>
					<button class="button" type="submit" name="direction" value="back"><?php echo esc_html__( 'Back', 'blixis' ); ?></button><?php endif; ?>
				<?php
				if ( $step < 6 ) :
					?>
					<button class="button button-primary" type="submit" name="direction" value="next"><?php echo esc_html__( 'Next', 'blixis' ); ?></button>
					<?php
else :
	?>
					<button class="button button-primary" type="submit" name="direction" value="apply"><?php echo esc_html__( 'Apply', 'blixis' ); ?></button><?php endif; ?>
				<button class="button" type="submit" name="direction" value="cancel"><?php echo esc_html__( 'Cancel', 'blixis' ); ?></button>
				</p>
			</form>
		<?php endif; ?>
		</div>
		<style>.blixis-setup fieldset{max-width:55rem;border:1px solid #8c8f94;padding:1rem;margin:1rem 0}.blixis-setup legend{font-weight:700}.blixis-setup label{display:block;margin:.5rem 0}.blixis-setup input[type=text]{width:9rem}.blixis-setup :focus-visible{outline:3px solid #2271b1;outline-offset:2px}.blixis-preview{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem}.blixis-preview>section{background:var(--blx-color-bg);color:var(--blx-color-text);padding:1.5rem;border:2px solid var(--blx-color-line)}.blixis-preview a{color:var(--blx-color-link)}.blixis-preview strong{background:var(--blx-color-primary);color:var(--blx-color-on-primary);padding:.5rem;display:inline-block}</style>
		<?php
	}

	/**
	 * Render fields for a wizard step.
	 *
	 * @param int                  $step Step.
	 * @param string               $preset Preset.
	 * @param array<string, mixed> $tokens Draft.
	 * @param string               $appearance Site appearance draft.
	 */
	private static function fields( int $step, string $preset, array $tokens, string $appearance ): void {
		if ( 1 === $step ) {
			echo '<fieldset><legend>' . esc_html__( 'Choose a starting design', 'blixis' ) . '</legend>';
			foreach ( self::PRESETS as $id => $label ) {
				printf( '<label><input type="radio" name="preset" value="%s" %s> %s</label>', esc_attr( $id ), checked( $preset, $id, false ), esc_html( $label ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Each substitution is escaped.
			}
			echo '</fieldset>';
		} elseif ( \in_array( $step, [ 2, 3, 4 ], true ) ) {
			echo '<fieldset><legend>' . esc_html( self::STEP_NAMES[ $step ] ) . '</legend>';
			foreach ( $tokens as $name => $entry ) {
				if ( ! \is_string( $name ) ) {
					continue;
				}
				if ( ( 2 === $step && ! str_starts_with( $name, 'color-' ) ) || ( 3 === $step && ! \in_array( $name, [ 'font-body', 'font-heading', 'text-base' ], true ) ) || ( 4 === $step && ! ( str_starts_with( $name, 'space-' ) || str_starts_with( $name, 'radius-' ) || str_starts_with( $name, 'container-' ) ) ) ) {
					continue;
				}
				foreach ( str_starts_with( $name, 'color-' ) ? [ 'value', 'dark' ] : [ 'value' ] as $mode ) {
					$id    = $name . '-' . $mode;
					$label = $name . ( 'dark' === $mode ? ' (dark)' : ' (light/base)' );
					printf( '<label for="%s">%s</label>', esc_attr( $id ), esc_html( $label ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
					if ( str_starts_with( $name, 'color-' ) ) {
						printf( '<input id="%s" type="text" name="tokens[%s][%s]" value="%s" maxlength="7" pattern="#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}" required>', esc_attr( $id ), esc_attr( $name ), esc_attr( $mode ), esc_attr( $entry[ $mode ] ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
					} else {
						printf( '<select id="%s" name="tokens[%s][%s]">', esc_attr( $id ), esc_attr( $name ), esc_attr( $mode ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
						if ( str_starts_with( $name, 'font-' ) ) {
							$seed = self::preset_tokens( $preset );
							self::font_options( $name, $entry[ $mode ], $seed[ $name ]['value'] ?? $entry['value'] );
						} else {
							foreach ( TokenDraft::options( $name, $entry['value'] ) as $option ) {
								printf( '<option value="%s" %s>%s</option>', esc_attr( $option ), selected( $entry[ $mode ], $option, false ), esc_html( $option ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
							}
						}
						echo '</select>';
					}
				}
			}
			echo '</fieldset>';
			if ( 3 === $step && [] === FontLibrary::installed() ) {
				printf( '<p class="notice notice-info">%s <a href="%s">%s</a></p>', esc_html__( 'No Font Library families are installed.', 'blixis' ), esc_url( admin_url( 'font-library.php' ) ), esc_html__( 'Open Appearance > Fonts', 'blixis' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
			}
		} elseif ( 5 === $step ) {
			echo '<fieldset><legend>' . esc_html__( 'Appearance', 'blixis' ) . '</legend>';
			foreach ( [
				'auto'  => __( 'Auto', 'blixis' ),
				'light' => __( 'Light', 'blixis' ),
				'dark'  => __( 'Dark', 'blixis' ),
			] as $mode => $label ) {
				printf( '<label><input type="radio" name="appearance" value="%s" %s> %s</label>', esc_attr( $mode ), checked( $appearance, $mode, false ), esc_html( $label ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Each substitution is escaped.
			}
			echo '<p>' . esc_html__( 'Auto follows each visitor\'s system setting.', 'blixis' ) . '</p></fieldset>';
			echo '<p>' . esc_html__( 'Website appearance in both modes. Editor appearance and language are separate.', 'blixis' ) . '</p><div class="blixis-preview">';
			foreach ( [
				'value' => 'Light',
				'dark'  => 'Dark',
			] as $mode => $label ) {
				$style = '';
				foreach ( $tokens as $name => $entry ) {
					if ( str_starts_with( $name, 'color-' ) ) {
						$style .= '--blx-' . $name . ':' . $entry[ $mode ] . ';';
					}
				}
				$issues = TokenDraft::contrast_errors( $tokens );
				printf( '<section style="%s"><h3>%s</h3><p>%s</p><p><a href="#">%s</a></p><strong>%s</strong><p>%s</p></section>', esc_attr( $style ), esc_html( $label ), esc_html__( 'Sample text', 'blixis' ), esc_html__( 'Sample link', 'blixis' ), esc_html__( 'Primary action', 'blixis' ), esc_html( \array_filter( \array_keys( $issues ), static fn ( string $key ): bool => str_ends_with( $key, '-' . $mode ) ) ? 'Contrast check failed' : 'Contrast check passed' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
			}
			echo '</div>';
		}
	}

	/**
	 * Render installed and system font choices with their available variants.
	 *
	 * @param string $name Token name.
	 * @param string $selected_value Current selection.
	 * @param string $bundled_value Preset default.
	 */
	private static function font_options( string $name, string $selected_value, string $bundled_value ): void {
		$families = FontLibrary::installed();
		if ( $families ) {
			echo '<optgroup label="' . esc_attr__( 'Installed fonts', 'blixis' ) . '">';
			foreach ( $families as $family ) {
				$stack = FontLibrary::css_stack( $family['css_family'], 'sans-serif' );
				if ( null === $stack ) {
					continue;
				}
				$variants = \array_map( static fn ( array $face ): string => $face['weight'] . ' ' . $face['style'], $family['faces'] );
				$label    = $family['name'] . ( $variants ? ' (' . \implode( ', ', $variants ) . ')' : '' );
				printf( '<option value="%s" %s>%s</option>', esc_attr( $stack ), selected( $selected_value, $stack, false ), esc_html( $label ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
			}
			echo '</optgroup>';
		}
		echo '<optgroup label="' . esc_attr__( 'System fonts', 'blixis' ) . '">';
		foreach ( TokenDraft::options( $name, $bundled_value ) as $option ) {
			printf( '<option value="%s" %s>%s</option>', esc_attr( $option ), selected( $selected_value, $option, false ), esc_html( $option ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
		}
		echo '</optgroup>';
	}

	/** Start or resume setup. */
	public static function start(): void {
		self::handle_entry( 'start' );
	}

	/** Dismiss the notice. */
	public static function dismiss(): void {
		self::handle_entry( 'dismiss' );
	}

	/**
	 * Handle a start or dismiss action.
	 *
	 * @param string $action Entry action.
	 */
	private static function handle_entry( string $action ): void {
		self::require_post();
		check_admin_referer( self::NONCE_ACTION, 'blixis_setup_nonce_' . $action );
		$next = SetupState::transition( get_option( SetupState::OPTION, false ), $action, gmdate( DATE_ATOM ) );
		if ( null !== $next ) {
			update_option( SetupState::OPTION, $next, false );
		}
		wp_safe_redirect( admin_url( 'dismiss' === $action ? 'themes.php' : 'themes.php?page=blixis-setup' ) );
		exit;
	}

	/** Show the saved design system, a confirmation after applying and the restore form. */
	private static function saved_panel(): void {
		$saved = DesignSystemStore::current();
		if ( isset( $_GET['applied'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Fixed post-redirect message.
			echo '<div class="notice notice-success"><p>' . esc_html__( 'The design system was saved.', 'blixis' ) . '</p></div>';
		}
		if ( isset( $_GET['restored'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Fixed post-redirect message.
			echo '<div class="notice notice-success"><p>' . esc_html__( 'The previous design system was restored.', 'blixis' ) . '</p></div>';
		}
		if ( null === $saved ) {
			return;
		}
		?>
		<section aria-labelledby="blixis-saved"><h2 id="blixis-saved"><?php echo esc_html__( 'Saved design system', 'blixis' ); ?></h2>
		<p>
		<?php
		/* translators: 1: preset, 2: version number, 3: date. */
		printf( esc_html__( 'Preset %1$s, version %2$s, saved %3$s.', 'blixis' ), esc_html( $saved['preset'] ), esc_html( (string) $saved['tokenVersion'] ), esc_html( $saved['updated_at'] ) );
		?>
		</p>
		<?php
		if ( [] !== DesignSystemStore::history() ) {
			self::action_form( 'rollback', __( 'Restore the previous design system', 'blixis' ) );
		}
		echo '</section>';
	}

	/** Restore the previous design system. */
	public static function rollback(): void {
		self::require_post();
		check_admin_referer( self::NONCE_ACTION, 'blixis_setup_nonce_rollback' );
		$result = DesignSystemStore::rollback();
		wp_safe_redirect( admin_url( 'themes.php?page=blixis-setup' . ( $result['ok'] ? '&restored=1' : '&error=not-saved' ) ) );
		exit;
	}

	/** Handle a wizard POST. */
	public static function wizard(): void {
		self::require_post();
		$step = isset( $_POST['step'] ) ? (int) $_POST['step'] : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked below.
		if ( $step < 1 || $step > 6 ) {
			wp_die( esc_html__( 'Invalid step.', 'blixis' ), '', [ 'response' => 400 ] );
		}
		check_admin_referer( 'blixis_setup_step_' . $step, 'blixis_setup_nonce_wizard' );
		$user_id = get_current_user_id();
		if ( $step > SetupState::resume_step( $user_id ) ) {
			wp_die( esc_html__( 'Step is unavailable.', 'blixis' ), '', [ 'response' => 403 ] );
		}
		$direction = isset( $_POST['direction'] ) ? sanitize_key( wp_unslash( $_POST['direction'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked above.
		if ( 'cancel' === $direction ) {
			wp_safe_redirect( admin_url( 'themes.php' ) );
			exit;
		}
		if ( 'back' === $direction ) {
			$previous = SetupState::next_step( $step, 'back' );
			if ( null !== $previous ) {
				SetupState::save_resume_step( $user_id, $previous );
				self::redirect_step( $previous );
			}
		}
		if ( ! \in_array( $direction, [ 'next', 'apply' ], true ) || ( 'apply' === $direction ) !== ( 6 === $step ) ) {
			wp_die( esc_html__( 'Invalid action.', 'blixis' ), '', [ 'response' => 400 ] );
		}
		$draft = self::draft( $user_id );
		if ( 1 === $step ) {
			$preset = isset( $_POST['preset'] ) ? sanitize_key( wp_unslash( $_POST['preset'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked above.
			if ( ! isset( self::PRESETS[ $preset ] ) ) {
				self::redirect_step( $step, 'invalid' );
			}
			$tokens = self::preset_tokens( $preset );
			if ( null === $tokens ) {
				self::redirect_step( $step, 'unavailable' );
			}
			$draft = [
				'preset'     => $preset,
				'tokens'     => $tokens,
				'appearance' => $draft['appearance'] ?? Appearance::site_mode(),
			];
		} elseif ( null === $draft ) {
			self::redirect_step( 1, 'invalid' );
		} elseif ( \in_array( $step, [ 2, 3, 4 ], true ) ) {
			$submitted = isset( $_POST['tokens'] ) ? wp_unslash( $_POST['tokens'] ) : []; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked above.
			if ( ! \is_array( $submitted ) || \strlen( (string) wp_json_encode( $submitted ) ) > TokenDraft::MAX_BYTES ) {
				self::redirect_step( $step, 'invalid' );
			}
			$tokens  = $draft['tokens'];
			$allowed = self::editable_names( $step, $tokens );
			if ( \array_diff( \array_keys( $submitted ), $allowed ) || \array_diff( $allowed, \array_keys( $submitted ) ) ) {
				self::redirect_step( $step, 'invalid' );
			}
			foreach ( $submitted as $name => $entry ) {
				$tokens[ $name ] = $entry;
			}
			$seed   = self::preset_tokens( $draft['preset'] );
			$errors = null === $seed ? [ 'tokens' => 'Unavailable' ] : TokenDraft::validate( $tokens, $seed, FontLibrary::allowed_stacks() );
			if ( $errors ) {
				update_user_meta( $user_id, 'blixis_setup_errors', $errors );
				self::redirect_step( $step, \count( TokenDraft::contrast_errors( $tokens ) ) ? 'contrast' : 'invalid' );
			}
			$draft['tokens'] = $tokens;
		} elseif ( 5 === $step ) {
			$appearance = isset( $_POST['appearance'] ) ? wp_unslash( $_POST['appearance'] ) : null; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked above.
			if ( ! \is_string( $appearance ) || ! \in_array( $appearance, [ 'auto', 'light', 'dark' ], true ) ) {
				self::redirect_step( $step, 'invalid' );
			}
			$draft['appearance'] = $appearance;
		}
		if ( 6 === $step ) {
			$seed = self::preset_tokens( $draft['preset'] );
			if ( null === $seed || TokenDraft::validate( $draft['tokens'], $seed, FontLibrary::allowed_stacks() ) ) {
				self::redirect_step( 6, 'invalid' );
			}
			$result = DesignSystemStore::apply( $draft['tokens'], $draft['preset'], $draft['appearance'] );
			if ( ! $result['ok'] ) {
				self::redirect_step( 6, 'not-saved' );
			}
			// Setup counts as completed only after the design system was persisted.
			$state = SetupState::transition( get_option( SetupState::OPTION, false ), 'complete', gmdate( DATE_ATOM ) );
			if ( null !== $state ) {
				update_option( SetupState::OPTION, $state, false );
			}
			delete_user_meta( $user_id, self::DRAFT_META );
			SetupState::save_resume_step( $user_id, 1 );
			wp_safe_redirect( admin_url( 'themes.php?page=blixis-setup&applied=1' ) );
			exit;
		} else {
			self::save_draft( $user_id, $draft );
			$state = SetupState::transition( get_option( SetupState::OPTION, false ), 'start', gmdate( DATE_ATOM ) );
			if ( null !== $state ) {
				update_option( SetupState::OPTION, $state, false );
			}
			$following = SetupState::next_step( $step, 'next' );
			if ( null !== $following ) {
				SetupState::save_resume_step( $user_id, $following );
				self::redirect_step( $following );
			}
		}
	}

	/**
	 * List token names editable at a step.
	 *
	 * @param int                  $step Step.
	 * @param array<string, mixed> $tokens Tokens.
	 * @return list<string> Editable names.
	 */
	private static function editable_names( int $step, array $tokens ): array {
		return \array_values(
			\array_filter(
				\array_keys( $tokens ),
				static function ( string $name ) use ( $step ): bool {
					return ( 2 === $step && str_starts_with( $name, 'color-' ) ) || ( 3 === $step && \in_array( $name, [ 'font-body', 'font-heading', 'text-base' ], true ) ) || ( 4 === $step && ( str_starts_with( $name, 'space-' ) || str_starts_with( $name, 'radius-' ) || str_starts_with( $name, 'container-' ) ) );
				}
			)
		);
	}

	/**
	 * Read a validated per-user draft.
	 *
	 * @param int $user_id User ID.
	 * @return array{preset: string, tokens: array<string, mixed>, appearance: string}|null Draft.
	 */
	private static function draft( int $user_id ): ?array {
		$raw = get_user_meta( $user_id, self::DRAFT_META, true );
		if ( ! \is_string( $raw ) || \strlen( $raw ) > TokenDraft::MAX_BYTES ) {
			return null;
		}
		$data = json_decode( $raw, true );
		if ( ! \is_array( $data ) || ! \in_array( \array_keys( $data ), [ [ 'preset', 'tokens' ], [ 'preset', 'tokens', 'appearance' ] ], true ) || ! \is_string( $data['preset'] ) || ! isset( self::PRESETS[ $data['preset'] ] ) || ( \array_key_exists( 'appearance', $data ) && Appearance::normalize( $data['appearance'] ) !== $data['appearance'] ) ) {
			return null;
		}
		$seed = self::preset_tokens( $data['preset'] );
		if ( null === $seed || TokenDraft::validate( $data['tokens'], $seed, FontLibrary::allowed_stacks() ) ) {
			return null;
		}
		return [
			'preset'     => $data['preset'],
			'tokens'     => $data['tokens'],
			'appearance' => $data['appearance'] ?? Appearance::site_mode(),
		];
	}

	/**
	 * Store a bounded draft.
	 *
	 * @param int                  $user_id User ID.
	 * @param array<string, mixed> $draft Draft.
	 */
	private static function save_draft( int $user_id, array $draft ): void {
		$json = wp_json_encode( $draft );
		if ( \is_string( $json ) && \strlen( $json ) <= TokenDraft::MAX_BYTES ) {
			update_user_meta( $user_id, self::DRAFT_META, wp_slash( $json ) ); // Meta storage strips slashes, which would break the JSON escapes.
		}
	}

	/**
	 * Load bundled preset tokens.
	 *
	 * @param string $preset Preset ID.
	 * @return array<string, mixed>|null Tokens.
	 */
	private static function preset_tokens( string $preset ): ?array {
		if ( ! isset( self::PRESETS[ $preset ] ) ) {
			return null;
		}
		$path = get_template_directory() . '/design/' . ( 'custom' === $preset ? 'default-tokens.json' : 'presets/' . $preset . '.json' );
		return TokenDraft::seed( $path, $preset );
	}

	/**
	 * Redirect to a wizard step.
	 *
	 * @param int    $step Step.
	 * @param string $error Fixed error code.
	 */
	private static function redirect_step( int $step, string $error = '' ): never {
		$url = admin_url( 'themes.php?page=blixis-setup&step=' . $step );
		if ( '' !== $error ) {
			$url = add_query_arg( 'error', $error, $url );
		}
		wp_safe_redirect( $url );
		exit;
	}

	/**
	 * Render a nonce-protected entry action.
	 *
	 * @param string $action Action.
	 * @param string $label Label.
	 */
	private static function action_form( string $action, string $label ): void {
		?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline-block;margin:0 1em 1em 0"><input type="hidden" name="action" value="<?php echo esc_attr( 'blixis_setup_' . $action ); ?>"><?php wp_nonce_field( self::NONCE_ACTION, 'blixis_setup_nonce_' . $action ); ?><button class="button button-secondary" type="submit"><?php echo esc_html( $label ); ?></button></form>
		<?php
	}

	/** Reject unauthorized or non-POST requests. */
	private static function require_post(): void {
		self::require_capability();
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			wp_die( esc_html__( 'Method not allowed.', 'blixis' ), '', [ 'response' => 403 ] );
		}
	}

	/** Enforce theme-management capability. */
	private static function require_capability(): void {
		if ( ! current_user_can( self::CAPABILITY ) ) {
			wp_die( esc_html__( 'You are not allowed to manage theme setup.', 'blixis' ), '', [ 'response' => 403 ] );
		}
	}
}
